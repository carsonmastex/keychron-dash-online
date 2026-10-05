# Keychron Dash · Online

The online version of the Keychron × PAX Aus 2026 runner game, with a shared
worldwide leaderboard and an admin page for player contact details.
(The booth version is a separate repo: `carsonmastex/keychron-pax`.)

- **Players** play at `/`, then save their score with name, email, phone and
  a consent tick. The public top 10 shows names and scores only.
- **Admins** log in at `/admin/` with a password to see every score with
  email and phone, search, download a CSV, or delete an entry.

Runs on Cloudflare: a Worker (`worker/index.ts`) serves the API and the static
pages in `public/`, and scores live in a D1 database.

## Anti-cheat (basic)

Each run gets a signed start token from the server. A score is rejected if the
token is missing, forged or reused, if the distance is impossible for the time
played, or if the score is far above what the run could earn. Each device can
save at most 5 scores per 10 minutes, and admin logins are rate limited.
A determined cheater can still fake a plausible score, so check winners by
hand before awarding prizes.

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev            # http://localhost:8787
```

Create a `.dev.vars` file (never committed) for local secrets:

```
ADMIN_PASSWORD="choose-a-local-password"
SESSION_SECRET="any-long-random-string"
```

## First deploy

```bash
npx wrangler login                          # opens the browser
npx wrangler d1 create keychron-dash-online # paste the database_id into wrangler.jsonc
npm run db:migrate:remote
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD      # type the admin password when asked
npm run deploy
```

Later updates: `npm run deploy`. New database changes go in `migrations/`
and are applied with `npm run db:migrate:remote`.

## Files

| Path | What |
| --- | --- |
| `src/` | The game (React + canvas), same as the booth version plus the online entry form |
| `src/leaderboard.ts` | Client for the scores API |
| `admin/` | Admin page (HTML + script) |
| `worker/index.ts` | API: runs, leaderboard, scores, admin login, CSV |
| `migrations/` | D1 database schema |
| `wrangler.jsonc` | Cloudflare config |

Speed and difficulty settings are the constants at the top of `src/Game.tsx`.
3D models are not used here; all art is drawn in code.
