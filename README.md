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

## Embedding on another site

**Full page, auto-height (keychron.com.au):** paste
[`embed/keychron-page-snippet.html`](embed/keychron-page-snippet.html) into the
page's HTML. The game reports its height to the host page, which sizes the
iframe to match, so there is no scrolling inside the frame. On phones the host
page scrolls to the score entry when a run ends. The host script only accepts
messages from the game's origin; update `GAME_ORIGIN` and the iframe `src`
together if the game moves to another domain.

**Compact, fixed size:** use `?embed=1` to show only the game, filling the
iframe (no heading, how-to-play or footer):

```html
<iframe src="https://keychron-dash-online.contact-352.workers.dev/?embed=1"
        allow="autoplay; fullscreen" title="Keychron x PAX 2026"></iframe>
```

On phones the score entry and leaderboard cover the whole frame.

## Anti-cheat (basic)

- **Clock:** the game times itself with its own copy of `performance.now`
  taken at page load and simulates the real time that passed each frame,
  so console scripts that fake animation timestamps or throttle the frame
  rate can't slow the game down.
- **Run token:** each run gets a signed start time from the server; one save
  per run.
- **Time check:** speed depends only on distance, so the minimum game time
  for a distance is exact. A score that arrives sooner than that is
  rejected. One that took more than 2 minutes (+5%) longer is saved but
  flagged "Check" in the admin page (long pauses, or a slowed-down game).
- **Ceilings:** at most 2 switches and 1,500 points per second of game time
  (real runs peak at about 1.5 and 1,050).
- **Rate limit:** each device can save at most 5 scores per 10 minutes, and
  admin logins are rate limited.

The browser still reports the score, so someone could submit a believable
fake if they wait out the run time. Check winners by hand (video or a
supervised run) before awarding prizes. Scores saved before 13 Oct 2026
have no timing data.

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
