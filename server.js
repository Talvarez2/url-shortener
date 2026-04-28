const express = require('express');
const { nanoid } = require('nanoid');
const db = require('./src/db');

const app = express();
app.use(express.json());

const insertUrl = db.prepare('INSERT INTO urls (short_code, original_url) VALUES (?, ?)');
const findByCode = db.prepare('SELECT * FROM urls WHERE short_code = ?');

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

app.get('/:code', (req, res) => {
  const row = findByCode.get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.redirect(301, row.original_url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
