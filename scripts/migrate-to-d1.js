#!/usr/bin/env node
/**
 * Pindah semua data dari server lama (Vercel / Blob) ke Cloudflare D1.
 *
 * Pakai:
 *   node scripts/migrate-to-d1.js <URL_TUJUAN> [URL_SUMBER]
 *   PASSWORD=LIS26-27 node scripts/migrate-to-d1.js https://xxx.pages.dev
 *
 * Langkah: ambil `dump` dari server sumber (log mentah + status bayar + master),
 * lalu kirim ke `migrate_d1` di server tujuan. Aman diulang (replace, bukan append).
 */
const SRC = process.argv[3] || 'https://www.experimentlynss.my.id';
const DST = process.argv[2];
const PASSWORD = process.env.PASSWORD || process.env.ADMIN_PASSWORD;

if (!DST) {
  console.error('URL tujuan wajib. Contoh: node scripts/migrate-to-d1.js https://xxx.pages.dev');
  process.exit(1);
}
if (!PASSWORD) {
  console.error('Set PASSWORD=<Server Pass> dulu.');
  process.exit(1);
}

async function post(base, action, payload) {
  const r = await fetch(base.replace(/\/$/, '') + '/api?action=' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`); }
  if (!r.ok || json.ok === false) throw new Error(`${action} gagal: ${json.error || r.status}`);
  return json;
}

(async () => {
  console.log('Sumber :', SRC);
  console.log('Tujuan :', DST);
  const dump = await post(SRC, 'dump', { password: PASSWORD });
  console.log(`Diambil: ${dump.logs.length} log, ${Object.keys(dump.pay || {}).length} tagihan, ` +
    `${(dump.anggota || []).length} anggota, ${(dump.lis || []).length} pengurus`);
  const res = await post(DST, 'migrate_d1', {
    password: PASSWORD,
    logs: dump.logs,
    pay: dump.pay,
    anggota: dump.anggota,
    lis: dump.lis,
  });
  console.log(`Ditulis: ${res.logs} log, ${res.pay} tagihan, ${res.anggota} anggota, ${res.lis} pengurus`);
  console.log(`Verifikasi D1: ${res.d1Count} baris log — ${res.verified ? 'COCOK' : 'TIDAK COCOK, ulangi migrasi'}`);
  process.exit(res.verified ? 0 : 2);
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
