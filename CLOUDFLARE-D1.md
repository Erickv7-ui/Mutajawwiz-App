# Pindah ke Cloudflare (Pages + Functions + D1) — tanpa kartu

Semua yang di sini gratis dan **tidak butuh kartu debit/kredit**: Cloudflare Pages
(statis + Functions) dan D1 (SQLite). Tidak ada billing Google, tidak ada file kunci
JSON, tidak ada Vercel Blob.

Arsitektur:

```
Browser → Cloudflare Pages (index.html, css, js)
        → Functions /api/*  (functions/api/[[path]].js)
        → D1 "mutajawwiz"  (tabel logs, pay, meta)
```

`api/index.js` tetap satu-satunya backend. Driver database dipilih otomatis:
binding `env.DB` ada → `d1`; `DB_DRIVER=firestore` → Firestore; selain itu → Blob lama.

## 1. Akun & alat

1. Daftar di https://dash.cloudflare.com/sign-up (email saja, tanpa kartu).
2. Di terminal repo:

```bash
npx wrangler login
```

Browser terbuka, klik **Allow**.

## 2. Buat database D1

```bash
npx wrangler d1 create mutajawwiz
```

Output berisi `database_id = "xxxxxxxx-...."`. Salin ke `wrangler.toml`, ganti
`GANTI-DENGAN-ID-DARI-WRANGLER`.

Lalu buat tabelnya:

```bash
npm run db:init
```

## 3. Deploy

```bash
npm run cf:deploy
```

Perintah ini menjalankan `scripts/build-static.js` (menyalin `index.html`, `css`,
`js`, `data`, `assets` ke `dist/`) lalu `wrangler pages deploy dist`.
Hasil: URL `https://mutajawwiz.pages.dev`.

Kalau ini deploy pertama dan project belum ada, buat dulu:

```bash
npx wrangler pages project create mutajawwiz --production-branch main
```

## 4. Password admin

Password tidak ikut ke repo. Set sebagai secret:

```bash
npx wrangler pages secret put ADMIN_PASSWORD   # Server Pass (Hapus Semua Data, migrasi)
npx wrangler pages secret put ADMIN_PIN        # PIN harian (opsional, default 2627)
```

## 5. Pindahkan semua data lama

Jalankan dari laptop, butuh akses ke server lama (masih hidup di Vercel):

```bash
PASSWORD=<ServerPass> node scripts/migrate-to-d1.js https://mutajawwiz.pages.dev
```

Skrip mengambil `dump` (log mentah + status bayar + master anggota + pengurus) dari
server lama, mengirimnya ke `migrate_d1` di server baru, lalu memverifikasi jumlah
baris. Aman diulang — `migrate_d1` mengganti isi, bukan menambah.

## 6. Pasang domain

1. Cloudflare → **Workers & Pages** → `mutajawwiz` → **Custom domains** → tambah
   `www.experimentlynss.my.id` dan `experimentlynss.my.id`.
2. Karena domain didaftarkan di cloudhost.id, ubah **nameserver** domain ke dua NS
   yang diberikan Cloudflare (bentuknya `xxx.ns.cloudflare.com`). Ini dilakukan di
   panel cloudhost.id, menu DNS/Nameserver.
3. Tunggu propagasi (biasanya < 1 jam). Cek: `https://www.experimentlynss.my.id/api?action=ping`
   harus balas `"driver":"d1"` dan `"version":"v51"`.

Kalau tidak mau memindah nameserver, pakai CNAME: `www` → `mutajawwiz.pages.dev`
(proxy/orange cloud aktif). Apex `experimentlynss.my.id` butuh nameserver Cloudflare
atau ALIAS/ANAME dari cloudhost.id.

## 7. Verifikasi setelah live

- `GET /api?action=ping` → `driver: "d1"`.
- Buka web, login, absen satu orang → muncul di daftar, lalu refresh masih ada.
- `GET /api?action=logs` → jumlah sama dengan data lama (121 entri saat migrasi ini).
- Tagihan: tandai lunas satu siswa, refresh, status tetap.
- Ekspor XLSX jalan.

## 8. Rollback

Hapus custom domain di Cloudflare → trafik balik ke Vercel (masih hidup, `driver: blob`).
Data yang masuk saat di Cloudflare tidak otomatis balik — jalankan `dump` dari
`https://mutajawwiz.pages.dev/api?action=dump` lalu `migrate_d1` ke Vercel kalau perlu
(atau biarkan Cloudflare jadi sumber utama).

## Catatan kuota gratis

- Pages: 100.000 request/hari (Functions), bandwidth statis tak dibatasi.
- D1: 5 juta baris dibaca/hari, 100.000 baris ditulis/hari, 5 GB penyimpanan.
- Pemakaian nyata aplikasi ini: ~1.000 baris/hari. Jauh di bawah batas.
