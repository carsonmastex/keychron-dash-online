// Builds Keychron Dash into self-contained HTML (JS, CSS and logos inlined).
//   npm run build        -> public/index.html (game) and public/admin/ (admin page),
//                           served by the Cloudflare Worker (see wrangler.jsonc)
//   npm run build:debug  -> same, plus window.__game / window.__bench test hooks
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(root, "src", "main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  loader: { ".png": "dataurl" },
  define: {
    "process.env.NODE_ENV": '"production"',
    __DEBUG__: process.env.PAX_DEBUG === "1" ? "true" : "false",
  },
  logLevel: "warning",
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = await readFile(join(root, "src", "game.css"), "utf8");
const head = `<title>Keychron x PAX 2026</title>
<style>${css}</style>
`;
const content = `<div id="root"></div>
<script>${js}</script>
`;
const body = head + content;

void body;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Keychron x PAX 2026: race through Melbourne to PAX Aus and top the worldwide leaderboard.">
${head}</head>
<body>
${content}</body>
</html>
`;
await mkdir(join(root, "public", "admin"), { recursive: true });
await writeFile(join(root, "public", "index.html"), page);

// Admin page: static HTML plus a small bundled script
await build({
  entryPoints: [join(root, "admin", "admin.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: join(root, "public", "admin", "admin.js"),
  logLevel: "warning",
});
await writeFile(join(root, "public", "admin", "index.html"), await readFile(join(root, "admin", "index.html"), "utf8"));

// Response headers for the static pages (Cloudflare static assets `_headers`).
// The admin page can't be framed by other sites or indexed by search engines;
// the game page stays frameable for the keychron.com.au embed.
await writeFile(
  join(root, "public", "_headers"),
  `/admin/*
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cache-Control: no-store

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`,
);

console.log(`public/index.html (${(page.length / 1024).toFixed(0)} KB), public/admin/`);
