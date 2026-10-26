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

## Themes (PAX / Halloween)

The game has two looks, chosen when it is built:

- **Halloween** (default for Halloween 2026): haunted Melbourne, candy, pumpkin
  keycaps, re-skinned obstacles plus skeleton hands and bats, four power-ups
  (broom, shield, candy magnet, ghost mode), haunted stretches at
  500, 1,500, 2,500 m ... (points x2 for 10 s, with lightning and thunder)
  each followed by a Pumpkin King mini-boss (a big crowned jack-o'-lantern), stomping (jump on pumpkins,
  coffins, hands, the hearse, bombs and spiders), throwing candy with Space
  (auto-aims at ghosts, bats, witches and cobwebs; a torn cobweb drops its
  spider onto the road), a witch boss every 1,000 m, and trick-or-treat
  doors (Space to knock), graveyard rails to grind, rooftop routes with gaps,
  and missions at the top of the screen. Controls: W / ↑ jump, S / ↓ slide,
  A D / ← → move, Space throw / knock (X also works). The candy combo bonus
  stops growing at 30 in this theme. The page logo is the round Keychron logo
  drawn as a jack-o'-lantern. Art is in `src/halloween.ts`.
- **PAX**: the original PAX Aus 2026 look.

```bash
npm run deploy                    # Halloween
GAME_THEME=pax npm run deploy     # back to PAX
```

For testing, `?theme=pax` or `?theme=halloween` on the URL overrides the build.
Obstacle hitboxes and speed are the same in both themes, so the server's
anti-cheat checks work for both.

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
- **Ceilings:** at most 2.5 switches/candy and 2,500 points per second of
  game time (a perfect bot peaks at about 1.75 and 1,500; real runs about 1.1
  and 950).
- **Long runs:** runs over 20 km are saved but flagged "Check".
- **No console access to the game:** the live game state is kept outside
  React, so it can't be found and edited from the browser console
  (e.g. lives = 999).
- **Rate limit:** each device can save at most 5 scores per 10 minutes, and
  admin logins are rate limited.

The browser still reports the score, so someone could submit a believable
fake if they wait out the run time. Check winners by hand (video or a
supervised run) before awarding prizes. Scores saved before 13 Oct 2026
have no timing data. The PAX records (785) were exported and cleared on
26 Oct 2026 before the Halloween launch.

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
