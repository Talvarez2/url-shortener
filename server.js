const express = require('express');
const { nanoid } = require('nanoid');
const db = require('./src/db');

const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const insertUrl = db.prepare('INSERT INTO urls (short_code, original_url) VALUES (?, ?)');
const findByCode = db.prepare('SELECT * FROM urls WHERE short_code = ?');
const insertClick = db.prepare('INSERT INTO clicks (url_id, referrer, user_agent, ip_country) VALUES (?, ?, ?, ?)');

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

app.post('/api/shorten', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const code = nanoid(8);
  try {
    insertUrl.run(code, url);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Code collision, try again' });
    throw e;
  }
  res.json({ short_code: code, short_url: `${req.protocol}://${req.get('host')}/${code}` });
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
  insertClick.run(row.id, req.get('referer') || null, req.get('user-agent') || null, null);
  res.redirect(301, row.original_url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
