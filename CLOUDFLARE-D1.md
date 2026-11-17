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

`api/index.js` tetap satu-satunya backend. Driver database cuma satu: Cloudflare
D1 (SQLite). Kalau binding `env.DB` tidak ada, server menjawab 503 dengan pesan
jelas — tidak ada lagi jalur cadangan Blob / Firestore / file JSON.

## Status deploy (17 November 2026)

Sudah jalan:

- Akun Cloudflare: `Exprabout18@gmail.com's Account` (id `52db208f...`).
- D1 `mutajawwiz`, id `8ea51d8e-c5db-4542-8428-7fbcc9ba5a2b`, region APAC/SIN.
- Pages project `mutajawwiz` → **https://mutajawwiz.pages.dev** (production `main`).
- Secret `ADMIN_PASSWORD` dan `ADMIN_PIN` sudah dipasang (production).
- Data dimigrasi dan diverifikasi: 121 log, 62 tagihan, 724 anggota, 28 pengurus,
  53 status lunas. `GET /api?action=logs` = 121.
- Uji di produksi: save, save_bulk 8 paralel (8/8 masuk), pay/unpay, hidden_bulk,
  deleteLog, export — semua 200. `logs` ~130 ms, `bootstrap` ~240 ms (colo SIN).
- Nameserver domain **sudah pindah** ke `bonnie.ns.cloudflare.com` +
  `carlos.ns.cloudflare.com`; zona `experimentlynss.my.id` status **active**.
- Custom domain `www.experimentlynss.my.id` dan apex `experimentlynss.my.id`
  sudah terdaftar di project Pages (status `initializing`).

Sisa: record DNS masih menunjuk IP Vercel (`www` A → `64.29.17.x` / `216.198.79.x`),
jadi Pages belum bisa verifikasi domain. Yang perlu diubah di zona:

- `www` → CNAME `mutajawwiz.pages.dev`, proxy aktif.
- apex `experimentlynss.my.id` → CNAME/AAAA sesuai yang ditampilkan Pages.
- hapus A record lama yang menunjuk Vercel.


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

## v53 (17 November 2026) — pindah total, nol Vercel

- Repo tidak lagi punya `vercel.json` maupun dependency `@vercel/blob`; satu-satunya jalur deploy: `npx wrangler pages deploy dist --project-name mutajawwiz --branch main`.
- Zona `experimentlynss.my.id` (full setup, NS `bonnie`/`carlos`) isinya: CAA x3, CNAME `@`/`www`/`*` -> `mutajawwiz.pages.dev` proxied.
- Bukti www sudah di Cloudflare (DNS publik): `https://dns.google/resolve?name=www.experimentlynss.my.id&type=A` -> 104.21.1.175 / 172.67.129.171.
- Endpoint cek cepat: `/api?action=ping` harus balas `version v53`, `driver d1`, `dbReady true`.
