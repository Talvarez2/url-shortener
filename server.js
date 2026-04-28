const express = require('express');
const { nanoid } = require('nanoid');
const path = require('path');
const db = require('./src/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Rate limiter (in-memory) ---
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map();

app.use('/api/', (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  let entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { start: now, count: 0 };
    hits.set(ip, entry);
  }
  if (++entry.count > MAX_REQUESTS) return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  next();
});

// Clean stale rate-limit entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (now - e.start > WINDOW_MS) hits.delete(ip);
}, 300_000);

// --- Prepared statements ---
const insertUrl = db.prepare('INSERT INTO urls (short_code, original_url, expires_at) VALUES (?, ?, ?)');
const findByCode = db.prepare('SELECT * FROM urls WHERE short_code = ?');
const insertClick = db.prepare('INSERT INTO clicks (url_id, referrer, user_agent, ip_country) VALUES (?, ?, ?, ?)');
const deleteExpired = db.prepare("DELETE FROM urls WHERE expires_at IS NOT NULL AND expires_at < datetime('now')");

const statsQuery = db.prepare(`
  SELECT u.original_url, u.created_at, u.expires_at, COUNT(c.id) as total_clicks
  FROM urls u LEFT JOIN clicks c ON c.url_id = u.id
  WHERE u.short_code = ? GROUP BY u.id
`);
const timelineQuery = db.prepare(`
  SELECT date(timestamp) as date, COUNT(*) as clicks
  FROM clicks WHERE url_id = ? GROUP BY date(timestamp) ORDER BY date
`);
const referrerQuery = db.prepare(`
  SELECT referrer, COUNT(*) as count FROM clicks
  WHERE url_id = ? AND referrer IS NOT NULL GROUP BY referrer ORDER BY count DESC LIMIT 10
`);

// --- Expiry cleanup every 60s ---
setInterval(() => deleteExpired.run(), 60_000);

// --- Routes ---
app.post('/api/shorten', (req, res) => {
  const { url, custom_code, ttl_minutes } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const code = custom_code || nanoid(8);
  if (custom_code) {
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(custom_code)) return res.status(400).json({ error: 'Custom code must be 3-32 alphanumeric characters' });
    if (findByCode.get(custom_code)) return res.status(409).json({ error: 'Custom code already taken' });
  }

  const expires_at = ttl_minutes ? new Date(Date.now() + ttl_minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19) : null;

  try {
    insertUrl.run(code, url, expires_at);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Code collision, try again' });
    throw e;
  }
  res.json({ short_code: code, short_url: `${req.protocol}://${req.get('host')}/${code}`, expires_at });
});

app.get('/api/stats/:code', (req, res) => {
  const row = statsQuery.get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const urlRow = findByCode.get(req.params.code);
  res.json({
    original_url: row.original_url,
    created_at: row.created_at,
    expires_at: row.expires_at,
    total_clicks: row.total_clicks,
    timeline: timelineQuery.all(urlRow.id),
    top_referrers: referrerQuery.all(urlRow.id)
  });
});

app.get('/:code', (req, res) => {
  const row = findByCode.get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.expires_at && new Date(row.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired' });
  insertClick.run(row.id, req.get('referer') || null, req.get('user-agent') || null, null);
  res.redirect(301, row.original_url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
