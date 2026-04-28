# AGENTS.md

## Project Overview

Node.js URL shortener with Express, SQLite (better-sqlite3), and nanoid.

## Structure

- `server.js` — Express app: routes, rate limiter, expiry cron
- `src/db.js` — SQLite setup, table creation (urls, clicks)
- `public/` — Static frontend (index.html, stats.html, css/)

## Key Decisions

- **SQLite** — single-file DB, no external dependencies, WAL mode for concurrency
- **nanoid v3** — CommonJS-compatible, 8-char codes
- **In-memory rate limiter** — simple Map-based, no Redis needed for single-instance
- **Prepared statements** — all queries use `db.prepare()` for performance and safety

## Conventions

- CommonJS (`require`/`module.exports`)
- No ORM — raw SQL with better-sqlite3
- Minimal dependencies — no middleware libraries beyond Express
