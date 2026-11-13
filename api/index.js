const { put, list, get, del } = require('@vercel/blob');
const { randomBytes } = require('crypto');
const SEED_ANGGOTA = require('../data/master.json');
const SEED_LIS = require('../data/lis.json');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const LOG_PREFIX = 'logs/';
const PAY_PREFIX = 'pay/';
const DB_ANGGOTA = 'db/anggota.json';
const DB_LIS = 'db/lis.json';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'LIS26-27';

function send(res, status, obj) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  // Anti-cache: data absensi & master harus selalu fresh (biar ga numpuk cache lama)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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
  // get() returns a ReadableStream (not a Response)
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
    const records = await readMany(await listAll(PAY_PREFIX));
    const map = {};
    records.forEach((p) => {
      if (!p || !p.tgl || !p.stambuk) return;
      map[`${p.tgl}__${p.stambuk}`] = p;
    });
    return map;
  } catch {
    return {};
  }
}

/** Gabungkan log dengan status bayar (tidak ada record = belum lunas) */
function mergePayments(logs, payMap) {
  return logs.map((l) => {
    const date = String(l.tgl || l.timestamp || '').slice(0, 10);
    const p = payMap[`${date}__${l.stambuk || ''}`];
    if (!p) return Object.assign({ lunas: false, tgl_lunas: '', penerima: '' }, l, { tgl: date });
    return Object.assign({}, l, {
      tgl: date,
      lunas: !!p.lunas,
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
        const blobs = await listAllLogs();
        // pathname: logs/YYYY-MM-DD/LOG-xxx.json
        const picked = blobs.filter((b) => {
          const m = /logs\/(\d{4}-\d{2}-\d{2})\//.exec(b.pathname);
          if (!m) return false;
          if (from && m[1] < from) return false;
          if (to && m[1] > to) return false;
          return true;
        });
        const data = await readMany(picked);
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
      const prefix = `${LOG_PREFIX}${date}/`;
      try {
        let page = await list({ prefix, token: TOKEN });
        let blobs = [...page.blobs];
        while (page.cursor) {
          page = await list({ prefix, token: TOKEN, cursor: page.cursor });
          blobs.push(...page.blobs);
        }
        const data = [];
        const readErrors = [];
        for (const b of blobs) {
          try {
            const rec = await readBlob(b.pathname);
            if (rec) data.push(rec);
          } catch (e) {
            readErrors.push({ pathname: b.pathname, err: e.message });
          }
        }
        const payMap = await readPayments();
        const merged = mergePayments(data, payMap);
        merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        return send(res, 200, { ok: true, data: merged, _debug: { count: blobs.length, readErrors } });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal membaca data: ' + err.message });
      }
    }

    return send(res, 404, { ok: false, error: 'Action tidak dikenal' });
  }

  // ---------- POST ----------
  if (req.method === 'POST') {
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
        await put(`${LOG_PREFIX}${date}/${id}.json`, JSON.stringify(rec), {
          access: 'private',
          token: TOKEN,
          contentType: 'application/json',
          addRandomSuffix: false,
        });
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
      if (!tgl || !stambuk) {
        return send(res, 400, { ok: false, error: 'tgl dan stambuk wajib diisi' });
      }
      try {
        const rec = {
          tgl,
          stambuk,
          nama: body.nama || '',
          lunas: action === 'pay',
          tgl_lunas: action === 'pay' ? (body.tgl_lunas || todayWIB()) : '',
          penerima: action === 'pay' ? (body.penerima || 'Petugas LIS') : '',
          updated_at: nowWIB(),
        };
        await writeJson(`${PAY_PREFIX}${tgl}__${stambuk}.json`, rec);
        return send(res, 200, { ok: true, payment: rec });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal menyimpan status bayar: ' + err.message });
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
        const target = (await listAll(LOG_PREFIX)).filter((b) => b.pathname.includes(id));
        if (!target.length) return send(res, 404, { ok: false, error: 'Log tidak ditemukan' });
        await del(target.map((b) => b.pathname), { token: TOKEN });
        return send(res, 200, { ok: true, deleted: target.length });
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
        const blobs = await listAllLogs();
        const payBlobs = await listAll(PAY_PREFIX);
        const all = blobs.concat(payBlobs);
        if (all.length) {
          await del(all.map((b) => b.pathname), { token: TOKEN });
        }
        return send(res, 200, { ok: true, deleted: all.length });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal hapus: ' + err.message });
      }
    }

    return send(res, 404, { ok: false, error: 'Action tidak dikenal' });
  }

  return send(res, 405, { ok: false, error: 'Method tidak didukung' });
};
