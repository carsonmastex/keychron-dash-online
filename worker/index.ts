// Keychron Dash online API (Cloudflare Worker + D1).
//
// Public:
//   POST /api/runs                 start a run, returns a signed run token
//   GET  /api/leaderboard          top 10 (names and scores only, no contact details)
//   POST /api/scores               save a finished run with name, email, phone, consent
// Admin (cookie session after password login):
//   POST /api/admin/login | /api/admin/logout,  GET /api/admin/me
//   GET  /api/admin/scores?q=&limit=&offset=     full rows incl. email and phone
//   GET  /api/admin/scores.csv                   CSV export
//   DELETE /api/admin/scores/:id
// Everything else is served from public/ (game at /, admin page at /admin/).

import { isBlockedName } from "../src/profanity";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

const TOP_N = 10;
const SESSION_HOURS = 12;
const COOKIE = "kd_admin";
// Game constants used for plausibility checks (keep in sync with src/Game.tsx)
const MAX_SPEED = 14.8; // keep in sync with src/Game.tsx
const METRES_PER_SPEED_SECOND = 1.25;
const SUBMIT_LIMIT = { count: 5, minutes: 10 };
const LOGIN_FAIL_LIMIT = { count: 8, minutes: 15 };

const encoder = new TextEncoder();

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
const fail = (status: number, error: string) => json({ error }, status);

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

async function ipHash(request: Request, env: Env) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  return (await hmac(env.SESSION_SECRET, `ip:${ip}`)).slice(0, 32);
}

// ---------- run tokens: "<startMs>.<nonce>.<sig>" ----------
async function newRunToken(env: Env) {
  const start = Date.now();
  const nonce = crypto.randomUUID();
  const sig = await hmac(env.SESSION_SECRET, `run:${start}:${nonce}`);
  return `${start}.${nonce}.${sig}`;
}
async function readRunToken(env: Env, token: unknown) {
  if (typeof token !== "string") return null;
  const [startText, nonce, sig] = token.split(".");
  const start = Number(startText);
  if (!Number.isFinite(start) || !nonce || !sig) return null;
  const expected = await hmac(env.SESSION_SECRET, `run:${start}:${nonce}`);
  if (!safeEqual(sig, expected)) return null;
  return { start, nonce };
}

// ---------- admin session cookie: "<expiryMs>.<sig>" ----------
async function newSession(env: Env) {
  const expiry = Date.now() + SESSION_HOURS * 3600_000;
  return `${expiry}.${await hmac(env.SESSION_SECRET, `admin:${expiry}`)}`;
}
async function isAdmin(request: Request, env: Env) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!match) return false;
  const [expiryText, sig] = decodeURIComponent(match[1]).split(".");
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry < Date.now() || !sig) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, `admin:${expiry}`));
}
const sessionCookie = (value: string, maxAge: number) =>
  `${COOKIE}=${encodeURIComponent(value)}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

// ---------- validation ----------
const cleanName = (value: unknown) =>
  Array.from(String(value ?? "").trim().replace(/\s+/g, " ")).slice(0, 12).join("");
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const PHONE = /^\+?[0-9 ()-]{6,20}$/;

/** Loose ceiling on score for a run, from the game's scoring rules. */
function plausibleMaxScore(distance: number, switches: number) {
  // movement 3.2/m, near-miss bonuses, switch combos, keycaps and keyboard bonuses
  return Math.ceil(distance * 3.2 + distance * 12 + switches * 800 + 4000);
}

function sinceIso(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function handleSubmit(request: Request, env: Env, ctx: ExecutionContext) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request");
  }
  const name = cleanName(body.name);
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const score = Number(body.score);
  const switches = Number(body.switches);
  const distance = Number(body.distance);
  if (!name) return fail(400, "Please enter your name");
  if (isBlockedName(name)) return fail(400, "Please choose a different name");
  if (!EMAIL.test(email)) return fail(400, "Please enter a valid email");
  if (!PHONE.test(phone)) return fail(400, "Please enter a valid phone number");
  if (body.consent !== true) return fail(400, "Please tick the box to agree to be contacted");
  if (![score, switches, distance].every((n) => Number.isInteger(n) && n >= 0)) return fail(400, "Invalid score");

  const run = await readRunToken(env, body.runToken);
  if (!run) return fail(400, "This game could not be verified. Please play again.");
  const elapsedSec = (Date.now() - run.start) / 1000;
  const maxDistance = elapsedSec * MAX_SPEED * METRES_PER_SPEED_SECOND * 1.1 + 20;
  if (elapsedSec > 3 * 3600 || distance > maxDistance || switches > distance * 0.6 + 10 || score > plausibleMaxScore(distance, switches)) {
    return fail(400, "This score could not be verified. Please play again.");
  }

  const ip = await ipHash(request, env);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?")
    .bind(ip, sinceIso(SUBMIT_LIMIT.minutes))
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= SUBMIT_LIMIT.count) return fail(429, "Too many scores from this device. Please try again later.");

  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      "INSERT INTO scores (name, email, phone, score, switches, distance, run_id, ip_hash, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
      .bind(name, email, phone, score, switches, distance, run.nonce, ip, now, now)
      .first<{ id: number }>();
    const above = await env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE score > ?").bind(score).first<{ n: number }>();
    await invalidateLeaderboard(ctx);
    return json({ id: String(row?.id), rank: (above?.n ?? 0) + 1 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return fail(409, "This game has already been saved.");
    throw error;
  }
}

// The top 10 is cached for LEADERBOARD_CACHE_SECONDS so crowds of players
// don't each hit the database: first in this isolate's memory (works on any
// hostname), then in Cloudflare's edge cache where available. "?fresh=1"
// (sent once right after saving a score) skips both so players see themselves.
const LEADERBOARD_CACHE_SECONDS = 10;
const LEADERBOARD_CACHE_KEY = "https://cache.keychron-dash/leaderboard";
let memoryBoard: { body: string; expires: number } | null = null;

async function readLeaderboard(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, score, switches, distance, created_at AS createdAt FROM scores ORDER BY score DESC, id ASC LIMIT ?",
  )
    .bind(TOP_N)
    .all();
  return JSON.stringify({ scores: results.map((r) => ({ ...r, id: String(r.id) })) });
}

function boardResponse(body: string) {
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${LEADERBOARD_CACHE_SECONDS}`,
    },
  });
}

async function handleLeaderboard(url: URL, env: Env, ctx: ExecutionContext) {
  const fresh = url.searchParams.has("fresh");
  const now = Date.now();
  if (!fresh && memoryBoard && memoryBoard.expires > now) return boardResponse(memoryBoard.body);
  const edge = caches.default;
  if (!fresh) {
    const hit = await edge.match(LEADERBOARD_CACHE_KEY);
    if (hit) {
      const body = await hit.text();
      memoryBoard = { body, expires: now + LEADERBOARD_CACHE_SECONDS * 1000 };
      return boardResponse(body);
    }
  }
  const body = await readLeaderboard(env);
  memoryBoard = { body, expires: now + LEADERBOARD_CACHE_SECONDS * 1000 };
  ctx.waitUntil(edge.put(LEADERBOARD_CACHE_KEY, boardResponse(body)));
  return boardResponse(body);
}

/** Drop cached copies after the board changes (this location only; others expire within 10 s). */
async function invalidateLeaderboard(ctx: ExecutionContext) {
  memoryBoard = null;
  ctx.waitUntil(caches.default.delete(LEADERBOARD_CACHE_KEY).then(() => undefined));
}

async function handleLogin(request: Request, env: Env) {
  const ip = await ipHash(request, env);
  const failures = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_login_failures WHERE ip_hash = ? AND created_at > ?")
    .bind(ip, sinceIso(LOGIN_FAIL_LIMIT.minutes))
    .first<{ n: number }>();
  if ((failures?.n ?? 0) >= LOGIN_FAIL_LIMIT.count) return fail(429, "Too many attempts. Try again in 15 minutes.");
  let password = "";
  try {
    password = String(((await request.json()) as { password?: unknown }).password ?? "");
  } catch {
    // fall through to the failure path
  }
  if (!env.ADMIN_PASSWORD || !password || !safeEqual(password, env.ADMIN_PASSWORD)) {
    await env.DB.prepare("INSERT INTO admin_login_failures (ip_hash) VALUES (?)").bind(ip).run();
    await new Promise((resolve) => setTimeout(resolve, 600));
    return fail(401, "Wrong password");
  }
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(await newSession(env), SESSION_HOURS * 3600) });
}

function adminQuery(url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const where = q ? "WHERE name LIKE ?1 OR email LIKE ?1 OR phone LIKE ?1" : "";
  return { where, args: q ? [`%${q}%`] : [] };
}

async function handleAdminScores(url: URL, env: Env) {
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const { where, args } = adminQuery(url);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM scores ${where}`).bind(...args).first<{ n: number }>();
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, phone, score, switches, distance, created_at AS createdAt FROM scores ${where} ORDER BY score DESC, id ASC LIMIT ${limit} OFFSET ${offset}`,
  )
    .bind(...args)
    .all();
  return json({ total: total?.n ?? 0, scores: results });
}

const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // stop spreadsheet formula injection
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function handleCsv(url: URL, env: Env) {
  const { where, args } = adminQuery(url);
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, phone, score, switches, distance, created_at FROM scores ${where} ORDER BY score DESC, id ASC`,
  )
    .bind(...args)
    .all();
  const header = ["rank", "name", "email", "phone", "score", "switches", "distance_m", "played_at_utc"];
  const lines = results.map((r, i) =>
    [i + 1, r.name, r.email, r.phone, r.score, r.switches, r.distance, r.created_at].map(csvCell).join(","),
  );
  return new Response("﻿" + [header.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="keychron-dash-scores-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    try {
      if (pathname === "/api/runs" && method === "POST") return json({ token: await newRunToken(env) });
      if (pathname === "/api/leaderboard" && method === "GET") return handleLeaderboard(url, env, ctx);
      if (pathname === "/api/scores" && method === "POST") return handleSubmit(request, env, ctx);

      if (pathname === "/api/admin/login" && method === "POST") return handleLogin(request, env);
      if (pathname === "/api/admin/logout" && method === "POST")
        return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
      if (pathname.startsWith("/api/admin/")) {
        if (!(await isAdmin(request, env))) return fail(401, "Please log in");
        if (pathname === "/api/admin/me" && method === "GET") return json({ ok: true });
        if (pathname === "/api/admin/scores" && method === "GET") return handleAdminScores(url, env);
        if (pathname === "/api/admin/scores.csv" && method === "GET") return handleCsv(url, env);
        const del = pathname.match(/^\/api\/admin\/scores\/(\d+)$/);
        if (del && method === "DELETE") {
          await env.DB.prepare("DELETE FROM scores WHERE id = ?").bind(Number(del[1])).run();
          await invalidateLeaderboard(ctx);
          return json({ ok: true });
        }
      }
      if (pathname.startsWith("/api/")) return fail(404, "Not found");
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return fail(500, "Something went wrong. Please try again.");
    }
  },
} satisfies ExportedHandler<Env>;
