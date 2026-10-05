-- Keychron Dash online: scores with contact details, plus abuse controls.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  score INTEGER NOT NULL,
  switches INTEGER NOT NULL,
  distance INTEGER NOT NULL,
  run_id TEXT NOT NULL UNIQUE,          -- one submission per game run
  ip_hash TEXT NOT NULL,                -- salted hash, never the raw IP
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS scores_by_score ON scores (score DESC);
CREATE INDEX IF NOT EXISTS scores_by_ip_time ON scores (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS admin_login_failures (
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS admin_login_failures_by_ip ON admin_login_failures (ip_hash, created_at);
