const { randomBytes } = require('crypto');
const d1db = require('../lib/store-d1');

// ---------- runtime ----------
// Satu-satunya backend: Cloudflare D1 (SQLite). Binding `DB` dikirim adapter
// (functions/api/[[path]].js) lewat configure(). Tidak ada lagi jalur Blob /
// Firestore / file JSON: kalau binding tidak ada, server menjawab 503 jelas
// daripada diam-diam menyimpan di memori lalu hilang.
const _rt = { d1: null };

/** Dipanggil adapter (Cloudflare) sebelum handler jalan. */
function configure(env) {
  if (!env) return;
  if (env.DB) _rt.d1 = env.DB;
}

function driverName() { return 'd1'; }
function hasDb() { return !!_rt.d1; }

// versi kode server — dipakai untuk memastikan deploy sudah jalan
const SERVER_VERSION = 'v57';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'LIS26-27';
// PIN Pusat (dipakai UI untuk buka sesi admin). Server menerima PIN ini juga
// untuk aksi harian (lunas, ekspor, CRUD) supaya user tidak bingung dua sandi.
const ADMIN_PIN = process.env.ADMIN_PIN || '2627';

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
  // Portabel: jalan di Pages Functions maupun Node biasa.
  res.statusCode = status;
  res.end(JSON.stringify(obj));
}

function nowWIB() {
  const d = new Date();
  // WIB = UTC+7, dipaksa supaya server yang jalan di UTC tetap benar.
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

function isAdmin(pw) {
  const v = String(pw || '').trim();
  return v === ADMIN_PASSWORD || v === ADMIN_PIN;
}
/** Aksi destruktif (hapus semua data) wajib Server Pass panjang, bukan PIN 4 digit */
function isStrictAdmin(pw) {
  return String(pw || '').trim() === ADMIN_PASSWORD;
}

/**
 * Kunci identitas entri. Dulu berbasis isi (tanggal+nama+bahasa+ucapan+kamar+pengabsen),
 * akibatnya absen dobel yang DISENGAJA (orang sama, hari sama) ikut dibuang dan
 * pengabsen yang diisi server ("Admin") membuat entri sama dianggap beda.
 * Sekarang identitas = id entri; isi hanya dipakai kalau entri benar-benar tanpa id.
 */
function logContentKey(l) {
  if (!l) return '';
  const id = l.client_id || l.id_log || l.id;
  if (id) return 'ID:' + String(id);
  return ['c', l.tgl, l.stambuk || l.nama, l.nama, l.bahasa,
    (l.ucapan || 'None').toLowerCase()].join('|');
}

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

/**
 * Kunci tulis per-proses. Dua permintaan simpan yang datang hampir bersamaan
 * (klik cepat, atau simpan tunggal berbarengan dengan flush antrian) dijalankan
 * berurutan supaya cek duplikat client_id tidak balapan.
 */
function makeWriteLock() {
  let tail = Promise.resolve();
  return function withLock(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  };
}
const withLogsLock = makeWriteLock();
const withPayLock = makeWriteLock();

// ---------- log absensi ----------

/** Semua log: 1 query D1 (berhalaman), bukan N file. */
async function readAllLogs() {
  const rows = await d1db.listLogs(_rt.d1);
  return dedupeLogs(rows.map((r) => enrichLog(r)).filter((l) => l && l.nama));
}

/** Simpan entri baru: INSERT OR REPLACE per baris, tanpa baca-ubah-tulis. */
async function appendLogs(items) {
  const list = (items || []).filter((x) => x && x.nama);
  if (!list.length) return;
  await d1db.upsertLogs(_rt.d1, list);
}

async function deleteLogs(ids) {
  const list = (ids || []).filter(Boolean).map(String);
  if (!list.length) return;
  await d1db.deleteLogs(_rt.d1, list);
}

async function replaceLogs(logs) {
  await d1db.replaceLogs(_rt.d1, logs || []);
}

// ---------- status bayar ----------
// Key = `${tgl}__${stambuk}`. Tanpa cache RAM: D1 sudah konsisten setelah tulis,
// jadi pay/unpay langsung terlihat di request berikutnya (cache RAM dulu yang
// membuat "lunas balik sendiri" dan tulisan yang hilang tanpa error).

async function readPayments() {
  return (await d1db.listPay(_rt.d1)) || {};
}

/** Tulis hanya yang berubah + hapus key yang dibuang (hemat tulis D1). */
async function writePayments(map) {
  const prev = (await d1db.listPay(_rt.d1)) || {};
  const changed = [];
  Object.keys(map).forEach((k) => {
    if (JSON.stringify(map[k] || null) === JSON.stringify(prev[k] || null)) return;
    const p = map[k];
    if (p && p.tgl && p.stambuk) changed.push(p);
  });
  const removed = Object.keys(prev).filter((k) => !(k in map));
  if (changed.length) await d1db.upsertPay(_rt.d1, changed);
  if (removed.length) await d1db.deletePay(_rt.d1, removed);
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

// ---------- master anggota / pengurus LIS ----------

/**
 * Tabel master dibaca dari tabel SQL `anggota` / `lis` (kolom nama, kelas,
 * stambuk, rayon/section, status + JSON utuh di kolom `data`).
 * Tidak ada lagi file JSON / seed di repo: sumber data cuma D1.
 */
async function loadTable(table) {
  return await d1db.listTable(_rt.d1, table);
}

const handler = async (req, res) => {
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

  // Tanpa binding D1 tidak ada tempat menyimpan.
  if (action !== 'ping' && !hasDb()) {
    return send(res, 503, {
      ok: false,
      error: 'Database D1 belum terpasang di runtime ini (binding DB tidak ada)',
      version: SERVER_VERSION,
    });
  }

  // ---------- GET ----------
  if (req.method === 'GET') {
    if (!action || action === 'ping') {
      return send(res, 200, {
        ok: true, mode: 'cloudflare', version: SERVER_VERSION,
        driver: driverName(), dbReady: hasDb(), ts: nowWIB(),
        store: 'sqlite-d1', tables: ['logs', 'pay', 'meta', 'anggota', 'lis'],
      });
    }

    // Master anggota + database pengurus LIS
    if (action === 'master' || action === 'lis') {
      const table = action === 'lis' ? 'lis' : 'anggota';
      try {
        const data = await loadTable(table);
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return send(res, 200, { ok: true, table, count: data.length, data });
      } catch (err) {
        return send(res, 500, { ok: false, table, error: 'Gagal membaca tabel ' + table + ': ' + err.message });
      }
    }

    // Log untuk rentang tanggal (dipakai panel export XLSX)
    if (action === 'logs') {
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      try {
        let data = await readAllLogs();
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
        const all = await readAllLogs();
        const data = all.filter(l => String(l.tgl || '').slice(0, 10) === date);
        const payMap = await readPayments();
        const merged = mergePayments(data, payMap);
        merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        return send(res, 200, { ok: true, data: merged });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal membaca data: ' + err.message });
      }
    }

    // BOOTSTRAP: gabung master + lis + logs + pay dalam satu request (hemat cold start)
    if (action === 'bootstrap') {
      try {
        const [anggotaRes, lisRes, logsRes, payRes] = await Promise.all([
          loadTable('anggota').catch(() => []),
          loadTable('lis').catch(() => []),
          readAllLogs().catch(() => []),
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
    // Simpan banyak absensi sekaligus (batch)
    if (action === 'save_bulk') {
      let items = body.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
      }
      if (!Array.isArray(items) || !items.length) {
        return send(res, 400, { ok: false, error: 'items wajib array' });
      }
      try {
        return await withLogsLock(async () => {
        const allLogs = await readAllLogs();
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
          // Anti-dobel hanya untuk kiriman ulang batch yang sama (id dari klien).
          // Absen dobel yang disengaja punya id berbeda → tetap dicatat.
          const cid = String(bodyItem.id || bodyItem.client_id || '');
          if (cid) rec.client_id = cid;
          const dup = cid
            ? allLogs.some(l => String(l.client_id || '') === cid)
            : false;
          if (!dup) { allLogs.push(rec); added.push(rec); }
        }
        await appendLogs(added);
        // acked = client_id yang sudah pasti ada di server (baru atau sudah pernah
        // masuk). Klien pakai ini untuk memotong antrian, jadi tidak perlu membaca
        // ulang seluruh logs setelah menyimpan.
        const acked = added.map((r) => r.client_id || r.id_log)
          .concat(items.map((x) => String((x && (x.id || x.client_id)) || '')).filter(Boolean));
        return send(res, 200, {
          ok: true, count: added.length, skipped: items.length - added.length,
          acked: Array.from(new Set(acked)),
        });
        });
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
        return await withLogsLock(async () => {
        const allLogs = await readAllLogs();
        const cid = String(body.id || body.client_id || '');
        if (cid) rec.client_id = cid;
        const dup = cid ? allLogs.some(l => String(l.client_id || '') === cid) : false;
        if (dup) {
          return send(res, 200, { ok: true, id_log: id, timestamp: ts, tgl: date, skipped: true });
        }
        await appendLogs([rec]);
        return send(res, 200, { ok: true, id_log: id, timestamp: ts, tgl: date });
        });
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
        return await withPayLock(async () => {
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
        });
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
        return await withPayLock(async () => {
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
        });
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
        return await withPayLock(async () => {
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
        });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal toggle hidden: ' + err.message });
      }
    }

    // Set hidden untuk BANYAK tagihan sekaligus — 1 tulis.
    // body: { items: [{ tgl, stambuk, nama }], hidden: true|false, password, penerima }
    if (action === 'hidden_bulk') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      const items = Array.isArray(body.items) ? body.items : [];
      const hidden = body.hidden !== false;
      if (!items.length) return send(res, 400, { ok: false, error: 'items kosong' });
      try {
        return await withPayLock(async () => {
        const payMap = await readPayments();
        let changed = 0;
        for (const it of items) {
          const tgl = String(it.tgl || '').trim();
          const payKey = String(it.stambuk || it.nama || '').trim();
          if (!tgl || !payKey) continue;
          const key = `${tgl}__${payKey}`;
          const existing = payMap[key] || { tgl, stambuk: payKey, nama: it.nama || '', lunas: false, hidden: false };
          existing.hidden = hidden;
          if (hidden) {
            existing.lunas = true;
            existing.tgl_lunas = existing.tgl_lunas || todayWIB();
            existing.penerima = existing.penerima || body.penerima || 'Petugas LIS';
          }
          existing.updated_at = nowWIB();
          payMap[key] = existing;
          changed++;
        }
        await writePayments(payMap);
        return send(res, 200, { ok: true, changed, hidden });
        });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal hidden massal: ' + err.message });
      }
    }

    // Deduplikasi log (hapus backfill duplikat) — hapus baris yang kontennya sama dengan baris lebih awal
    if (action === 'dedupe_logs') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      try {
        return await withLogsLock(async () => {
        const allLogs = await readAllLogs();
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
        await replaceLogs(deduped);
        return send(res, 200, { ok: true, before: allLogs.length, after: deduped.length, removed: allLogs.length - deduped.length });
        });
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
        return await withLogsLock(async () => {
        const allLogs = await readAllLogs();
        const exists = allLogs.some((l) => (l.id_log || l.id) === id);
        if (!exists) return send(res, 404, { ok: false, error: 'Log tidak ditemukan' });
        await deleteLogs([id]);
        return send(res, 200, { ok: true, deleted: 1 });
        });
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
          const merged = Object.assign({}, idx >= 0 ? rows[idx] : {}, rec, { id, label: rec.label || rec.nama });
          await d1db.upsertTable(_rt.d1, table, [merged]);
          const count = await d1db.countTable(_rt.d1, table);
          return send(res, 200, { ok: true, mode: idx >= 0 ? 'update' : 'add', record: merged, count });
        }
        const id = String(body.id || '').trim();
        const hard = String(body.hard || '') === 'true' || body.hard === true;
        const idx = rows.findIndex((r) => r.id === id);
        if (idx < 0) return send(res, 404, { ok: false, error: 'Data tidak ditemukan' });
        if (hard) {
          await d1db.deleteTableRow(_rt.d1, table, id);
        } else {
          const off = Object.assign({}, rows[idx], { status: 'Nonaktif' });
          await d1db.upsertTable(_rt.d1, table, [off]);
        }
        const count = await d1db.countTable(_rt.d1, table);
        return send(res, 200, { ok: true, mode: hard ? 'hard-delete' : 'deactivate', count });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal menyimpan database: ' + err.message });
      }
    }

    if (action === 'syncmaster') {
      try {
        const data = await loadTable('anggota');
        return send(res, 200, { ok: true, received: true, count: data.length });
      } catch {
        return send(res, 200, { ok: true, received: true, count: 0 });
      }
    }

    if (action === 'export') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      try {
        const data = await readAllLogs();
        const payMap = await readPayments();
        const merged = mergePayments(data, payMap);
        merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        return send(res, 200, { ok: true, count: merged.length, data: merged });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal export: ' + err.message });
      }
    }

    // Salinan mentah semua data (tanpa gabung status bayar) — dipakai skrip
    // migrasi / cadangan manual.
    if (action === 'dump') {
      if (!isAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah' });
      }
      try {
        const logs = await readAllLogs();
        const payMap = await readPayments();
        const anggota = await loadTable('anggota');
        const lis = await loadTable('lis');
        return send(res, 200, {
          ok: true, at: new Date().toISOString(), driver: driverName(),
          logs, pay: payMap, anggota, lis,
        });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Dump gagal: ' + err.message });
      }
    }

    // Terima salinan data (dari `dump`) dan tulis ke D1. Wajib Server Pass.
    if (action === 'migrate_d1') {
      if (!isStrictAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah (migrasi wajib Server Pass)' });
      }
      try {
        const logs = Array.isArray(body.logs) ? body.logs : [];
        const payMap = body.pay && typeof body.pay === 'object' ? body.pay : {};
        const payDocs = Object.keys(payMap).map((k) => payMap[k]).filter((p) => p && p.tgl && p.stambuk);
        const nLogs = await d1db.replaceLogs(_rt.d1, logs);
        const nPay = await d1db.replacePay(_rt.d1, payDocs);
        let nAnggota = 0;
        let nLis = 0;
        if (Array.isArray(body.anggota) && body.anggota.length) {
          nAnggota = await d1db.replaceTable(_rt.d1, 'anggota', body.anggota);
        }
        if (Array.isArray(body.lis) && body.lis.length) {
          nLis = await d1db.replaceTable(_rt.d1, 'lis', body.lis);
        }
        const check = await d1db.listLogs(_rt.d1);
        return send(res, 200, {
          ok: true, logs: nLogs, pay: nPay,
          anggota: nAnggota, lis: nLis,
          d1Count: check.length, verified: check.length === logs.length,
        });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Migrasi D1 gagal: ' + err.message });
      }
    }

    if (action === 'clearall') {
      if (!isStrictAdmin(body.password)) {
        return send(res, 401, { ok: false, error: 'Password admin salah (Hapus Semua Data wajib Server Pass)' });
      }
      try {
        const cleared = await d1db.clearAll(_rt.d1);
        return send(res, 200, { ok: true, mode: 'd1', cleared, deleted: 0 });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'Gagal hapus: ' + err.message });
      }
    }

    return send(res, 404, { ok: false, error: 'Action tidak dikenal' });
  }

  return send(res, 405, { ok: false, error: 'Method tidak didukung' });
};

module.exports = handler;
module.exports.handler = handler;
module.exports.configure = configure;
module.exports.driverName = driverName;
