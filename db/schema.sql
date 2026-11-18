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

-- Biaya kertas hukuman tambahan (nempel ke tagihan tgl + stambuk)
CREATE TABLE IF NOT EXISTS kertas (
  id TEXT PRIMARY KEY,
  tgl TEXT,
  stambuk TEXT,
  ts INTEGER,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kertas_tgl ON kertas(tgl);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  at INTEGER
);

-- Master anggota (menggantikan data/master.json)
CREATE TABLE IF NOT EXISTS anggota (
  id TEXT PRIMARY KEY,
  nama TEXT,
  kelas TEXT,
  stambuk TEXT,
  rayon TEXT,
  status TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_anggota_kelas ON anggota(kelas);

-- Pengurus LIS (menggantikan data/lis.json)
CREATE TABLE IF NOT EXISTS lis (
  id TEXT PRIMARY KEY,
  nama TEXT,
  kelas TEXT,
  stambuk TEXT,
  section TEXT,
  status TEXT,
  data TEXT NOT NULL
);
