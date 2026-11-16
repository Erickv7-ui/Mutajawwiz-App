-- Skema D1 (SQLite). Dijalankan sekali: npx wrangler d1 execute mutajawwiz --remote --file=db/schema.sql
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  tgl TEXT,
  ts INTEGER,
  pengabsen TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_tgl ON logs(tgl);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);

CREATE TABLE IF NOT EXISTS pay (
  k TEXT PRIMARY KEY,
  tgl TEXT,
  stambuk TEXT,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  at INTEGER
);
