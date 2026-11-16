/**
 * Backend database: Cloudflare D1 (SQLite).
 *
 * Dipakai kalau binding D1 tersedia di runtime (Pages Functions / Worker) atau
 * kalau DB_DRIVER=d1. Tidak butuh kartu, tidak butuh key JSON, tidak butuh
 * billing — kuota gratis D1: 5 juta baris dibaca/hari, 100 ribu baris ditulis/hari.
 *
 * Bentuk data sama dengan jalur Blob/Firestore: satu baris = satu entri absensi.
 * Kolom `data` menyimpan JSON utuh supaya field baru tidak perlu migrasi skema.
 */

let _schemaOk = false;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS logs (
     id TEXT PRIMARY KEY,
     tgl TEXT,
     ts INTEGER,
     pengabsen TEXT,
     data TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_logs_tgl ON logs(tgl)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts)`,
  `CREATE TABLE IF NOT EXISTS pay (
     k TEXT PRIMARY KEY,
     tgl TEXT,
     stambuk TEXT,
     data TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     k TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     at INTEGER
   )`,
];

async function ensureSchema(db) {
  if (_schemaOk) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  _schemaOk = true;
}

function logId(l) {
  return String((l && (l.id_log || l.id)) || '');
}

function payKey(p) {
  if (!p) return '';
  return `${p.tgl}__${p.stambuk}`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function listLogs(db) {
  await ensureSchema(db);
  const out = [];
  let offset = 0;
  const LIMIT = 1000;
  for (let guard = 0; guard < 100; guard++) {
    const rs = await db.prepare('SELECT data FROM logs ORDER BY ts ASC, id ASC LIMIT ? OFFSET ?')
      .bind(LIMIT, offset).all();
    const rows = (rs && rs.results) || [];
    for (const r of rows) {
      try { out.push(JSON.parse(r.data)); } catch { /* lewati baris rusak */ }
    }
    if (rows.length < LIMIT) break;
    offset += LIMIT;
  }
  return out;
}

async function countLogs(db) {
  await ensureSchema(db);
  const r = await db.prepare('SELECT COUNT(*) AS n FROM logs').first();
  return (r && r.n) || 0;
}

async function upsertLogs(db, items) {
  await ensureSchema(db);
  const list = (items || []).filter((l) => logId(l));
  let n = 0;
  for (const part of chunk(list, 100)) {
    const stmts = part.map((l) => db.prepare(
      'INSERT OR REPLACE INTO logs (id, tgl, ts, pengabsen, data) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      logId(l),
      String(l.tgl || (l.timestamp ? new Date(l.timestamp).toISOString().slice(0, 10) : '')),
      Number(l.timestamp) || 0,
      String(l.pengabsen || ''),
      JSON.stringify(l)
    ));
    await db.batch(stmts);
    n += stmts.length;
  }
  return n;
}

async function deleteLogs(db, ids) {
  await ensureSchema(db);
  const list = (ids || []).map(String).filter(Boolean);
  for (const part of chunk(list, 100)) {
    await db.batch(part.map((id) => db.prepare('DELETE FROM logs WHERE id = ?').bind(id)));
  }
  return list.length;
}

async function replaceLogs(db, items) {
  await ensureSchema(db);
  await db.prepare('DELETE FROM logs').run();
  return await upsertLogs(db, items);
}

async function listPay(db) {
  await ensureSchema(db);
  const rs = await db.prepare('SELECT k, data FROM pay').all();
  const map = {};
  for (const r of (rs && rs.results) || []) {
    try { map[r.k] = JSON.parse(r.data); } catch { /* lewati */ }
  }
  return map;
}

async function upsertPay(db, items) {
  await ensureSchema(db);
  const list = (items || []).filter((p) => payKey(p));
  let n = 0;
  for (const part of chunk(list, 100)) {
    const stmts = part.map((p) => db.prepare(
      'INSERT OR REPLACE INTO pay (k, tgl, stambuk, data) VALUES (?, ?, ?, ?)'
    ).bind(payKey(p), String(p.tgl || ''), String(p.stambuk || ''), JSON.stringify(p)));
    await db.batch(stmts);
    n += stmts.length;
  }
  return n;
}

async function deletePay(db, keys) {
  await ensureSchema(db);
  const list = (keys || []).map(String).filter(Boolean);
  for (const part of chunk(list, 100)) {
    await db.batch(part.map((k) => db.prepare('DELETE FROM pay WHERE k = ?').bind(k)));
  }
  return list.length;
}

async function replacePay(db, items) {
  await ensureSchema(db);
  await db.prepare('DELETE FROM pay').run();
  return await upsertPay(db, items);
}

async function getMeta(db, k) {
  await ensureSchema(db);
  const r = await db.prepare('SELECT data FROM meta WHERE k = ?').bind(String(k)).first();
  if (!r) return null;
  try { return JSON.parse(r.data); } catch { return null; }
}

async function setMeta(db, k, value) {
  await ensureSchema(db);
  await db.prepare('INSERT OR REPLACE INTO meta (k, data, at) VALUES (?, ?, ?)')
    .bind(String(k), JSON.stringify(value), Date.now()).run();
  return true;
}

async function clearAll(db) {
  await ensureSchema(db);
  const a = await db.prepare('DELETE FROM logs').run();
  const b = await db.prepare('DELETE FROM pay').run();
  return ((a && a.meta && a.meta.changes) || 0) + ((b && b.meta && b.meta.changes) || 0);
}

module.exports = {
  SCHEMA, ensureSchema,
  listLogs, countLogs, upsertLogs, deleteLogs, replaceLogs,
  listPay, upsertPay, deletePay, replacePay,
  getMeta, setMeta, clearAll,
  logId, payKey,
};
