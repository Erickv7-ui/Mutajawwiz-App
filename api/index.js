const { put, list, get, del } = require('@vercel/blob');
const { randomBytes } = require('crypto');
const SEED_ANGGOTA = require('../data/master.json');
const SEED_LIS = require('../data/lis.json');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const LOG_PREFIX = 'logs/';
const PAY_PREFIX = 'pay/';
const DB_ANGGOTA = 'db/anggota.json';
const DB_LIS = 'db/lis.json';
const LOGS_DB = 'db/logs.json';
const MIGRATED_FLAG = 'db/_migrated.json';

/** Flag supaya migrasi (list advanced op) cuma jalan sekali */
let _migratedCache = null;
async function isMigrated() {
  if (_migratedCache !== null) return _migratedCache;
  try {
    const v = await readJsonOrNull(MIGRATED_FLAG);
    _migratedCache = !!v;
    return _migratedCache;
  } catch { return false; }
}
async function markMigrated() {
  _migratedCache = true;
  try { await writeJson(MIGRATED_FLAG, { v: 1, ts: Date.now() }); } catch (e) { console.warn('markMigrated:', e.message); }
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'LIS26-27';

function send(res, status, obj) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  // Anti-cache default, tapi jangan timpa kalau endpoint sudah set cache sendiri
  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  res.status(status).end(JSON.stringify(obj));
}

function nowWIB() {
  const d = new Date();
  // WIB = UTC+7, getTimezoneOffset is in minutes (local minus UTC)
  // Server usually runs UTC so offset is 0.
  // Force +7 offset.
  const offsetMs = 7 * 60 * 60 * 1000;
  const wib = new Date(d.getTime() + offsetMs);
  return wib.toISOString().replace('T', ' ').substring(0, 19);
}

function todayWIB() {
  return nowWIB().split(' ')[0];
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function readBlob(pathname) {
  const r = await get(pathname, { access: 'private', token: TOKEN });
  if (!r || !r.stream) return null;
  // Private blob: consistent read via stream (langsung latest, tanpa CDN cache 60s)
  const text = await new Response(r.stream).text();
  return JSON.parse(text);
}

async function readJsonOrNull(pathname) {
  try {
    return await readBlob(pathname);
  } catch {
    return null;
  }
}

async function writeJson(pathname, obj) {
  await put(pathname, JSON.stringify(obj), {
    access: 'private',
    token: TOKEN,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function isAdmin(pw) {
  return String(pw || '').trim() === ADMIN_PASSWORD;
}

/** Ambil SEMUA blob dengan prefix, sudah dipaginasi */
async function listAll(prefix) {
  let page = await list({ prefix, token: TOKEN });
  let blobs = [...page.blobs];
  while (page.cursor) {
    page = await list({ prefix, token: TOKEN, cursor: page.cursor });
    blobs.push(...page.blobs);
  }
  return blobs;
}

async function listAllLogs() {
  return listAll(LOG_PREFIX);
}

/** Semua status pembayaran: key = `${tgl}__${stambuk}` */
async function readPayments() {
  try {
    const saved = await readJsonOrNull('db/pay.json');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
  } catch {}
  // fallback: scan lama (cuma jalan sekali, abis itu mark migrated)
  if (await isMigrated()) return {};
  try {
    const records = await readMany(await listAll(PAY_PREFIX));
    await markMigrated();
    const map = {};
    records.forEach((p) => { if (p && p.tgl && p.stambuk) map[`${p.tgl}__${p.stambuk}`] = p; });
    return map;
  } catch { return {}; }
}

/** Gabungkan log dengan status bayar (tidak ada record = belum lunas) */
async function writePayments(map) {
  await writeJson('db/pay.json', map);
}

/**
 * Store log cepat: satu blob db/logs.json (bukan ratusan blob per hari).
 * Migrasi otomatis dari blob lama kalau db/logs.json belum ada.
 */
function logContentKey(l) {
  return [l.tgl, l.stambuk || l.nama, l.nama, l.bahasa,
    (l.ucapan || 'None').toLowerCase(), l.kamar, l.pengabsen].join('|');
}

/** Buang duplikat konten, simpan yang paling awal */
/** Isi rayon & tingkat dari kamar/kelas kalau kosong (database lama) */
function enrichLog(l) {
  const rayons = ['Madinah', 'Ampel (1)', 'Ampel (2)', 'Gunung Jati', 'MTQ', 'RL'];
  if (!l.rayon && l.kamar) {
    const hit = rayons.find(rn => String(l.kamar).startsWith(rn) || String(l.kamar).includes(rn));
    if (hit) l.rayon = hit;
  }
  if (!l.tingkat && l.kelas) {
    const m = /^(\d|[IV]+)\b/.exec(String(l.kelas));
    if (m) l.tingkat = m[1];
  }
  return l;
}

function dedupeLogs(arr) {
  const sorted = [...arr].sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  const seen = new Set();
  const out = [];
  for (const l of sorted) {
    const k = logContentKey(l);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

async function readAllLogsFast() {
  const saved = await readJsonOrNull(LOGS_DB);
  if (Array.isArray(saved)) {
    const enriched = saved.map(enrichLog);
    const clean = dedupeLogs(enriched);
    if (clean.length !== saved.length) {
      try { await writeJson(LOGS_DB, clean); } catch (e) { console.warn('auto-dedupe simpan gagal:', e.message); }
    }
    return clean;
  }
  // migrasi sekali dari struktur lama logs/YYYY-MM-DD/*.json
  if (await isMigrated()) return [];
  try {
    const blobs = await listAllLogs();
    const legacy = await readMany(blobs);
    if (legacy.length) {
      try { await writeJson(LOGS_DB, legacy); } catch (e) { console.warn('migrasi logs gagal simpan:', e.message); }
    }
    await markMigrated();
    return legacy;
  } catch {
    return [];
  }
}

async function writeAllLogsFast(logs) {
  await writeJson(LOGS_DB, logs);
}

function mergePayments(logs, payMap) {
  return logs.map((l) => {
    const date = String(l.tgl || l.timestamp || '').slice(0, 10);
    const payKey = l.stambuk || l.nama || '';
    const p = payMap[`${date}__${payKey}`];
    if (!p) return Object.assign({ lunas: false, tgl_lunas: '', penerima: '', hidden: false }, l, { tgl: date });
    return Object.assign({}, l, {
      tgl: date,
      lunas: !!p.lunas,
      hidden: !!p.hidden,
      tgl_lunas: p.tgl_lunas || '',
      penerima: p.penerima || '',
    });
  });
}

/** Database anggota / lis: pakai blob kalau sudah pernah diedit, kalau belum pakai seed */
async function loadTable(table) {
  const path = table === 'lis' ? DB_LIS : DB_ANGGOTA;
  const seed = table === 'lis' ? SEED_LIS : SEED_ANGGOTA;
  const saved = await readJsonOrNull(path);
  if (Array.isArray(saved)) return saved;
  return seed;
}

/** Baca banyak blob paralel (dibatasi per batch biar nggak kena rate limit) */
async function readMany(blobs) {
  const out = [];
  const CHUNK = 40;
  for (let i = 0; i < blobs.length; i += CHUNK) {
    const slice = blobs.slice(i, i + CHUNK);
    const res = await Promise.all(
      slice.map(async (b) => {
        try { return await readBlob(b.pathname); } catch { return null; }
      })
    );
    res.forEach((r) => { if (r) out.push(r); });
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, {});
  }

  const url = new URL(req.url, 'http://localhost');
  let action = url.searchParams.get('action') || '';
  let body = {};

  if (req.method === 'POST') {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    try {
      if (ct.includes('application/x-www-form-urlencoded')) {
        const raw = await getRawBody(req);
        const p = new URLSearchParams(raw);
        p.forEach((v, k) => (body[k] = v));
      } else if (ct.includes('application/json')) {
        const raw = await getRawBody(req);
        body = JSON.parse(raw);
      } else {
        // fallback: try to parse whatever
        const raw = await getRawBody(req);
        try { body = JSON.parse(raw); } catch { body = Object.fromEntries(new URLSearchParams(raw)); }
      }
    } catch {}
    if (!action) action = body.action || '';
  }

  action = String(action).trim();
  // POST tanpa action = simpan absensi (kompatibel dengan frontend lama)
  if (!action && req.method === 'POST') action = 'save';

  // ---------- GET ----------
  if (req.method === 'GET') {
    if (!action || action === 'ping') {
      return send(res, 200, { ok: true, mode: 'vercel', ts: nowWIB() });
    }

    // Master anggota + database pengurus LIS
    if (action === 'master' || action === 'lis') {
      const table = action === 'lis' ? 'lis' : 'anggota';
      try {
        const data = await loadTable(table);
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return send(res, 200, { ok: true, table, count: data.length, data });
      } catch (err) {
        const seed = table === 'lis' ? SEED_LIS : SEED_ANGGOTA;
        return send(res, 200, { ok: true, table, count: seed.length, data: seed, fallback: true });
      }
    }

    // Log untuk rentang tanggal (dipakai panel export XLSX)
    if (action === 'logs') {
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      try {
        let data = await readAllLogsFast();
        if (from || to) {
          data = data.filter((l) => {
            const d = String(l.tgl || l.timestamp || '').slice(0, 10);
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
          });
        }
        const payMap = await readPayments();
        const merged = mergePayments(data, payMap);
        merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        return send(res, 200, { ok: true, count: merged.length, data: merged });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal membaca data: ' + err.message });
      }
    }

    if (action === 'log') {
      const date = url.searchParams.get('date') || todayWIB();
      try {
        const all = await readAllLogsFast();
        const data = all.filter(l => String(l.tgl || '').slice(0, 10) === date);
        const payMap = await readPayments();
        const merged = mergePayments(data, payMap);
        merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        return send(res, 200, { ok: true, data: merged });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal membaca data: ' + err.message });
      }
    }

    // BOOTSTRAP: gabung master + lis + logs + pay dalam satu request ( hemat 2 cold start )
    if (action === 'bootstrap') {
      try {
        const [anggotaRes, lisRes, logsRes, payRes] = await Promise.all([
          loadTable('anggota').catch(() => SEED_ANGGOTA),
          loadTable('lis').catch(() => SEED_LIS),
          readAllLogsFast().catch(() => []),
          readPayments().catch(() => ({})),
        ]);
        const merged = mergePayments(logsRes, payRes);
        merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        const payload = {
          ok: true,
          master: { count: anggotaRes.length, data: anggotaRes },
          lis: { count: lisRes.length, data: lisRes },
          logs: { count: merged.length, data: merged },
        };
        res.setHeader('Cache-Control', 'no-store');
        return send(res, 200, payload);
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Bootstrap gagal: ' + err.message });
      }
    }

    return send(res, 404, { ok: false, error: 'Action tidak dikenal' });
  }

  // ---------- POST ----------
  if (req.method === 'POST') {
    // Simpan banyak absensi sekaligus (batch — hemat blob ops)
    if (action === 'save_bulk') {
      let items = body.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
      }
      if (!Array.isArray(items) || !items.length) {
        return send(res, 400, { ok: false, error: 'items wajib array' });
      }
      try {
        const allLogs = await readAllLogsFast();
        const added = [];
        for (const bodyItem of items) {
          if (!bodyItem.nama) continue;
          const ts = nowWIB();
          const date = String(bodyItem.tgl || '').trim() || ts.split(' ')[0];
          const id = 'LOG-' + Date.now() + '-' + randomBytes(3).toString('hex').toUpperCase();
          const rec = {
            id_log: id,
            id,
            timestamp: ts,
            tgl: date,
            waktu: ts.split(' ')[1] || '',
            pengabsen: bodyItem.pengabsen || 'Admin',
            stambuk: bodyItem.stambuk || '',
            nama: bodyItem.nama,
            label: bodyItem.label || bodyItem.nama,
            kelas: bodyItem.kelas || '',
            tingkat: bodyItem.tingkat || '',
            rayon: bodyItem.rayon || '',
            kamar: bodyItem.kamar || '',
            bahasa: bodyItem.bahasa || 'Indonesian',
            ucapan: bodyItem.ucapan || 'None',
          };
          const dup = allLogs.some(l => logContentKey(l) === logContentKey(rec));
          if (!dup) { allLogs.push(rec); added.push(rec); }
        }
        await writeAllLogsFast(allLogs);
        return send(res, 200, { ok: true, count: added.length, skipped: items.length - added.length });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal bulk save: ' + err.message });
      }
    }

    if (action === 'save') {
      if (!body.nama) {
        return send(res, 400, { ok: false, error: 'Nama wajib diisi' });
      }
      const ts = nowWIB();
      const date = String(body.tgl || '').trim() || ts.split(' ')[0];
      const id = 'LOG-' + Date.now() + '-' + randomBytes(3).toString('hex').toUpperCase();
      const rec = {
        id_log: id,
        id: id,
        timestamp: ts,
        tgl: date,
        waktu: ts.split(' ')[1] || '',
        pengabsen: body.pengabsen || 'Admin',
        stambuk: body.stambuk || '',
        nama: body.nama,
        label: body.label || body.nama,
        kelas: body.kelas || '',
        tingkat: body.tingkat || '',
        rayon: body.rayon || '',
        kamar: body.kamar || '',
        bahasa: body.bahasa || 'Indonesian',
        ucapan: body.ucapan || 'None',
      };
      try {
        // Simpan ke store cepat (satu blob) — cek duplikat dulu
        const allLogs = await readAllLogsFast();
        const dup = allLogs.some(l => logContentKey(l) === logContentKey(rec));
        if (dup) {
          return send(res, 200, { ok: true, id_log: id, timestamp: ts, tgl: date, skipped: true });
        }
        allLogs.push(rec);
        await writeAllLogsFast(allLogs);
        return send(res, 200, { ok: true, id_log: id, timestamp: ts, tgl: date });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal menyimpan: ' + err.message });
      }
    }

    // Tandai satu tagihan (tanggal + stambuk) LUNAS / batal lunas
    if (action === 'pay' || action === 'unpay') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      const tgl = String(body.tgl || '').trim();
      const stambuk = String(body.stambuk || '').trim();
      const nama = String(body.nama || '').trim();
      const payKey = stambuk || nama;
      if (!tgl || !payKey) {
        return send(res, 400, { ok: false, error: 'tgl dan stambuk/nama wajib diisi' });
      }
      try {
        const payMap = await readPayments();
        const key = `${tgl}__${payKey}`;
        if (action === 'unpay') {
          delete payMap[key];
        } else {
          payMap[key] = {
            tgl,
            stambuk: stambuk || nama,
            nama: body.nama || '',
            lunas: true,
            hidden: body.hidden === true || body.hidden === 'true',
            tgl_lunas: body.tgl_lunas || todayWIB(),
            penerima: body.penerima || 'Petugas LIS',
            updated_at: nowWIB(),
          };
        }
        await writePayments(payMap);
        return send(res, 200, { ok: true, payment: payMap[key] || null });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal menyimpan status bayar: ' + err.message });
      }
    }

    // Lunasi massal (batch)
    if (action === 'pay_bulk') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      let items = body.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
      }
      if (!Array.isArray(items) || !items.length) {
        return send(res, 400, { ok: false, error: 'items wajib array' });
      }
      const penerima = body.penerima || 'Petugas LIS';
      const tglLunas = body.tgl_lunas || todayWIB();
      try {
        const payMap = await readPayments();
        for (const it of items) {
          const tgl = String(it.tgl || '').trim();
          const stambuk = String(it.stambuk || '').trim();
          const namaIt = String(it.nama || '').trim();
          const pk = stambuk || namaIt;
          if (!tgl || !pk) continue;
          const key = `${tgl}__${pk}`;
          payMap[key] = {
            tgl,
            stambuk: stambuk || namaIt,
            nama: it.nama || '',
            lunas: true,
            hidden: it.hidden === true || it.hidden === 'true',
            tgl_lunas: tglLunas,
            penerima,
            updated_at: nowWIB(),
          };
        }
        await writePayments(payMap);
        return send(res, 200, { ok: true, count: items.length });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal bulk pay: ' + err.message });
      }
    }

    // Toggle hidden payment (bayar tapi tidak masuk hitung total)
    if (action === 'toggle_hidden') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      const tgl = String(body.tgl || '').trim();
      const stambuk = String(body.stambuk || '').trim();
      const nama = String(body.nama || '').trim();
      const payKey = stambuk || nama;
      if (!tgl || !payKey) {
        return send(res, 400, { ok: false, error: 'tgl dan stambuk/nama wajib diisi' });
      }
      try {
        const payMap = await readPayments();
        const key = `${tgl}__${payKey}`;
        const existing = payMap[key] || { tgl, stambuk: payKey, nama: body.nama || '', lunas: false, hidden: false };
        existing.hidden = !existing.hidden;
        if (existing.hidden) {
          // hidden = bayar tapi tidak masuk total, jadi tandai lunas juga
          existing.lunas = true;
          existing.tgl_lunas = existing.tgl_lunas || todayWIB();
          existing.penerima = existing.penerima || body.penerima || 'Petugas LIS';
        }
        existing.updated_at = nowWIB();
        payMap[key] = existing;
        await writePayments(payMap);
        return send(res, 200, { ok: true, payment: existing });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal toggle hidden: ' + err.message });
      }
    }

    // Deduplikasi log (hapus backfill duplikat) — hapus baris yang kontennya sama dengan baris lebih awal
    if (action === 'dedupe_logs') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      try {
        const allLogs = await readAllLogsFast();
        const key = (l) => [l.tgl, l.stambuk || l.nama, l.nama, l.bahasa, (l.ucapan || 'None').toLowerCase(), l.kamar, l.pengabsen].join('|');
        // Kumpulkan key dari batch asli (terlama per grup) — jangan hapus record asli
        const sorted = [...allLogs].sort((a, b) =>
          String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
        );
        const firstSeen = new Map(); // key -> earliest record
        for (const l of sorted) { if (!firstSeen.has(key(l))) firstSeen.set(key(l), l); }
        const deduped = [];
        for (const l of sorted) {
          if (firstSeen.get(key(l)) === l) deduped.push(l);
        }
        await writeAllLogsFast(deduped);
        return send(res, 200, { ok: true, before: allLogs.length, after: deduped.length, removed: allLogs.length - deduped.length });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal dedupe: ' + err.message });
      }
    }

    // Hapus satu log absensi
    if (action === 'deleteLog') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      const id = String(body.id_log || body.id || '').trim();
      if (!id) return send(res, 400, { ok: false, error: 'id_log wajib diisi' });
      try {
        // hapus dari store cepat
        const allLogs = await readAllLogsFast();
        const removed = allLogs.filter((l) => (l.id_log || l.id) !== id);
        if (removed.length === allLogs.length) return send(res, 404, { ok: false, error: 'Log tidak ditemukan' });
        await writeAllLogsFast(removed);
        return send(res, 200, { ok: true, deleted: allLogs.length - removed.length });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal menghapus log: ' + err.message });
      }
    }

    // CRUD database (anggota / lis)
    if (action === 'db-save' || action === 'db-delete') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      const table = body.table === 'lis' ? 'lis' : 'anggota';
      try {
        const rows = await loadTable(table);
        if (action === 'db-save') {
          const rec = typeof body.record === 'string' ? JSON.parse(body.record) : body.record;
          if (!rec || !rec.nama) return send(res, 400, { ok: false, error: 'record.nama wajib diisi' });
          const id = rec.id || (table === 'lis'
            ? 'LIS-' + randomBytes(3).toString('hex').toUpperCase()
            : 'ANG-' + randomBytes(3).toString('hex').toUpperCase());
          const idx = rows.findIndex((r) => r.id === id);
          const merged = Object.assign({}, idx >= 0 ? rows[idx] : {}, rec, { id });
          if (idx >= 0) rows[idx] = merged;
          else rows.push(merged);
          await writeJson(table === 'lis' ? DB_LIS : DB_ANGGOTA, rows);
          return send(res, 200, { ok: true, mode: idx >= 0 ? 'update' : 'add', record: merged, count: rows.length });
        }
        const id = String(body.id || '').trim();
        const hard = String(body.hard || '') === 'true' || body.hard === true;
        const idx = rows.findIndex((r) => r.id === id);
        if (idx < 0) return send(res, 404, { ok: false, error: 'Data tidak ditemukan' });
        if (hard) rows.splice(idx, 1);
        else rows[idx] = Object.assign({}, rows[idx], { status: 'Nonaktif' });
        await writeJson(table === 'lis' ? DB_LIS : DB_ANGGOTA, rows);
        return send(res, 200, { ok: true, mode: hard ? 'hard-delete' : 'deactivate', count: rows.length });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal menyimpan database: ' + err.message });
      }
    }

    if (action === 'syncmaster') {
      try {
        const data = await loadTable('anggota');
        return send(res, 200, { ok: true, received: true, count: data.length });
      } catch {
        return send(res, 200, { ok: true, received: true, count: SEED_ANGGOTA.length });
      }
    }

    if (action === 'export') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      try {
        const blobs = await listAllLogs();
        const data = await readMany(blobs);
        const payMap = await readPayments();
        const merged = mergePayments(data, payMap);
        merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        return send(res, 200, { ok: true, count: merged.length, data: merged });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal export: ' + err.message });
      }
    }

    if (action === 'clearall') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      try {
        // 1) Kosongkan store baru (satu blob) — INI yang dipakai sekarang
        let cleared = 0;
        try { await writeJson(LOGS_DB, []); cleared++; } catch (e) { console.warn('clear logs:', e.message); }
        try { await writeJson('db/pay.json', {}); cleared++; } catch (e) { console.warn('clear pay:', e.message); }
        // 2) Hapus sisa blob lama (logs/YYYY-MM-DD/*, pay/*) — skip kalau sudah migrated
        let deleted = 0;
        if (!await isMigrated()) {
          try {
            const blobs = await listAllLogs();
            const payBlobs = await listAll(PAY_PREFIX);
            const all = blobs.concat(payBlobs);
            if (all.length) {
              await del(all.map((b) => b.pathname), { token: TOKEN });
              deleted = all.length;
            }
            await markMigrated();
          } catch (e) { console.warn('clear legacy:', e.message); }
        }
        return send(res, 200, { ok: true, cleared, deleted });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal hapus: ' + err.message });
      }
    }

    return send(res, 404, { ok: false, error: 'Action tidak dikenal' });
  }

  return send(res, 405, { ok: false, error: 'Method tidak didukung' });
};
