# url-shortener

URL shortener with analytics, rate limiting, and a clean frontend.

## Features

- **Shorten URLs** — generate 8-char short codes or use custom aliases
- **Analytics** — click tracking with timeline and top referrers
- **Rate limiting** — 30 requests/min per IP on API endpoints
- **URL expiry** — optional TTL, auto-cleanup of expired links
- **Frontend** — paste-and-shorten UI + analytics dashboard with Chart.js

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│   Browser    │────▶│  Express.js  │────▶│  SQLite   │
│  index.html  │     │  server.js   │     │  urls.db  │
│  stats.html  │◀────│              │◀────│           │
└─────────────┘     └──────────────┘     └──────────┘
                     │ Static files │
                     │ Rate limiter │
                     │ Expiry cron  │
```

## Quick Start

```bash
npm install
npm start        # http://localhost:3000
```

## Docker

```bash
docker compose up -d
```

## API

### POST /api/shorten

```json
{
  "url": "https://example.com",
  "custom_code": "mylink",
  "ttl_minutes": 1440
}
```

Response:
```json
{
  "short_code": "mylink",
  "short_url": "http://localhost:3000/mylink",
  "expires_at": "2026-04-29 16:00:00"
}
```

### GET /:code

301 redirect to original URL. Tracks click analytics.

### GET /api/stats/:code

```json
{
  "original_url": "https://example.com",
  "created_at": "2026-04-28 16:00:00",
  "expires_at": null,
  "total_clicks": 42,
  "timeline": [{ "date": "2026-04-28", "clicks": 42 }],
  "top_referrers": [{ "referrer": "https://twitter.com", "count": 10 }]
}
```

## Tech Stack

- **Runtime**: Node.js + Express
- **Database**: SQLite via better-sqlite3
- **IDs**: nanoid (8-char codes)
- **Charts**: Chart.js (CDN)
- **Container**: Docker + docker-compose
