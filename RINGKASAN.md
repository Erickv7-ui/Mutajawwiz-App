# Mutajawwiz LIS 26-27 — Ringkasan Fitur & Rekap Kuota Vercel

Terakhir diperbarui: 14 November 2026 (deploy v37)

- Produksi: https://www.experimentlynss.my.id
- Repo: github.com/Erickv7-ui/Mutajawwiz-App (branch `main`)
- Hosting: Vercel Hobby (gratis)
- Penyimpanan: Vercel Blob (JSON) + cache localStorage

---

## 1. Arsitektur Singkat

Aplikasi ini **bukan** pakai database SQL. Semua data disimpan sebagai file JSON:

| Data | Lokasi cloud | Lokasi statis (CDN) | Cache browser |
|------|--------------|---------------------|---------------|
| Anggota (724) | `db/anggota.json` | `data/master.json` | `lis2627_master_cache` |
| Petugas LIS (28) | `db/lis.json` | `data/lis.json` | `lis2627_lis_cache` |
| Log absensi | `db/logs.json` (1 blob) | — | `lis2627_logs_v3` |
| Status bayar/denda | `db/pay.json` (1 blob) | — | ikut log |
| Flag migrasi | `db/_migrated.json` | — | — |

Alur muat halaman:
1. Baca cache localStorage → UI langsung tampil
2. Fetch `data/master.json` + `data/lis.json` dari CDN (cepat, statis)
3. Panggil `api?action=bootstrap` → master + lis + logs + pay dalam **1 request**
4. Data cloud menimpa cache lokal (cloud = sumber kebenaran)

Alur simpan absensi (mode hemat kuota):
1. Entri masuk antrian lokal (`lis2627_pending_v1`)
2. Tiap 5 entri → 1 request `save_bulk` (bukan 5 request)
3. Saat tab ditutup / pindah tab → sisa antrian di-flush
4. Input massal (razia) → 1 request `save_bulk` untuk semua yang dicentang

---

## 2. Halaman & Fitur

### 01. Dashboard & Analitik
- Kartu statistik: total log, total denda, jumlah anggota, pelanggaran hari ini
- Grafik tren absensi & pelanggaran (canvas, ikut tema)
- Distribusi per rayon, per tingkat, per bahasa
- Ringkasan tagihan belum lunas vs lunas vs hidden

### 02. Input & Piket Lapangan
- Cari anggota (nama/stambuk/kamar) dengan datalist autofill
- Pilih bahasa: Indonesian / Javanese (tarif denda sama, Rp2.000)
- Pilih jenis ucapan (None, kosa kata, kalimat, dll)
- Kolom **Pengabsen** autofill dari daftar LIS (nama non-CAPS saja)
- Input massal: centang banyak anggota → simpan serentak (1 request)
- Tabel log hari ini + hapus entri
- Preview anggota terpilih (rayon, kamar, kelas, tingkat)

### 03. Pembayaran & Denda
- Konsolidasi tagihan per tanggal + stambuk/nama
- Filter status: belum lunas / lunas / hidden
- Tombol **LUNAS MASAL**: centang banyak baris → tandai lunas sekaligus
- Mode **HIDDEN**: pembayaran tercatat lunas tapi tidak masuk total tagihan
- Autofill nama penerima dari petugas LIS aktif
- Badge hidden count + opsi filter hidden

### 04. Laporan & Mahkamah
- Tabel laporan per rayon (jumlah kasus, denda, persentase)
- Rekap harian
- Export XLSX (SheetJS-free, writer sendiri) & CSV
- Filter tanggal dari–sampai

### 05. Pengaturan & PIN
- Tarif denda (default Rp2.000, disimpan `lis2627_tarif_v2`)
- PIN Admin lokal (default `2627`) untuk buka kunci panel sensitif
- Unduh semua data (CSV)
- Hapus semua data (butuh password server)
- Bersihkan cache peramban (localStorage + sessionStorage + reload)

### 06. Database (6 panel CRUD)
- Panel Anggota (724) — tambah / edit / hapus (soft delete default)
- Panel LIS (28) — tambah / edit / hapus
- Pencarian & filter per panel
- Perubahan langsung sinkron ke autofill pengabsen
- Import dari `Data LIS26-27.xlsx`
- Export XLSX

### Lain-lain
- **Login gate** password di awal (default `123456`, bisa diganti di dalam gate)
- Tema **dark & light** (toggle header, tersimpan)
- Layout **neo-brutalisme lembut** (border tebal, shadow keras, warna solid)
- **Mobile responsive** (skala font 13px / 11.5px, tabel scroll, modal 95vw)
- Popup informasi aplikasi saat pertama buka

---

## 3. API (satu serverless function)

Endpoint: `https://www.experimentlynss.my.id/api`

| Action | Method | Fungsi |
|--------|--------|--------|
| `ping` | GET | Cek server hidup |
| `bootstrap` | GET | master + lis + logs + pay sekaligus (1 request) |
| `master` / `lis` | GET | Baca tabel anggota / LIS |
| `logs` | GET | Semua log + status bayar |
| `log&date=` | GET | Log per tanggal (baca dari `db/logs.json`) |
| `save` | POST | Simpan 1 absensi (idempoten, cek duplikat) |
| `save_bulk` | POST | Simpan banyak absensi sekaligus |
| `pay` / `unpay` | POST | Tandai lunas / batal lunas |
| `pay_bulk` | POST | Lunas masal |
| `toggle_hidden` | POST | Sembunyikan/tampilkan tagihan dari total |
| `syncmaster` | POST | Simpan perubahan database anggota/LIS |
| `dedupe_logs` | POST | Bersihkan log duplikat (admin) |
| `clearall` | POST | Kosongkan log + pembayaran (admin) |
| `export` | GET | Unduh CSV |

Semua response JSON. `Cache-Control: no-store` kecuali master/lis (cache 60s).

---

## 4. Keamanan — 3 Password Berbeda

| Fungsi | Password default | Disimpan di |
|--------|------------------|-------------|
| Login halaman (gate) | `123456` | hash FNV di localStorage `lis2627_pass_v2` |
| PIN Admin lokal (buka kunci panel) | `2627` | localStorage `lis2627_admin_pin` |
| Server Pass (wajib untuk Hapus Semua Data) | `LIS26-27` | env `ADMIN_PASSWORD` di Vercel |
| PIN Admin juga diterima server untuk lunasi/ekspor/CRUD | `2627` | env `ADMIN_PIN` di Vercel |

Catatan penting:
- Gate login bersifat **client-side** — menghalangi orang awam, bukan keamanan kriptografis.
- API admin memvalidasi password di server (401 kalau salah).
- Ganti password server lewat Vercel → Settings → Environment Variables → `ADMIN_PASSWORD`, lalu redeploy.
- Ganti password gate dari dalam halaman login (tombol "Ganti Password").

---

## 5. Rekap Kuota Vercel Hobby

### Limit resmi (per bulan)

| Resource | Limit Hobby |
|----------|-------------|
| Function Invocations | 1.000.000 |
| Fast Data Transfer | 100 GB |
| Edge Requests | 1.000.000 |
| Function Duration | 100 GB-jam |
| Blob Storage | 1 GB |
| Blob Data Transfer | 10 GB |
| **Blob Simple Operations** | **10.000** |
| **Blob Advanced Operations** | **2.000** |
| Blob rate limit | 20 simple ops/detik |

### Klasifikasi operasi (menurut docs Vercel, per Sep 2026)

- **Advanced** (jatah Hobby **2.000/bulan**): upload (`put`), copy, `list`, set TTL, buat store.
- **Simple** (jatah Hobby **10.000/bulan**): akses blob URL yang cache MISS + baca metadata.
- **Data transfer** (10 GB/bulan): unduhan isi blob.

Artinya: **setiap penulisan = 1 Advanced op**, setiap pembacaan = Simple + data transfer.

### Pemakaian per aksi (setelah optimasi v38)

| Aksi | Simple ops | Advanced ops |
|------|-----------|--------------|
| Buka halaman (bootstrap) | 4 get (master, lis, logs, pay) | 0 |
| Simpan 1–4 absensi | 0 (masih di antrian lokal) | 0 |
| Simpan 5 absensi (batch) | 1 get | **1 put** |
| Input massal 30 anggota | 1 get | **1 put** |
| Tandai lunas 1 tagihan | 1 get | **1 put** |
| Lunas masal 10 tagihan | 1 get | **1 put** |
| Unduh/ekspor semua data | 1 get | 0 |
| Hapus semua data | 1 get | **1 put** |
| Migrasi awal (sekali seumur app) | beberapa get | 1–2 `list` |
| Baca ulang < 5 detik (cache RAM v38) | 0 | 0 |

### Estimasi harian (1–3 petugas, pemakaian wajar)

Skenario: 100 absensi/hari + 20 buka halaman + 10 pembayaran.

| Komponen | Hitungan | Simple ops/bulan |
|----------|----------|------------------|
| Bootstrap | 20 × 4 × 30 | 2.400 |
| Simpan absensi (batch 5) | 100/5 × 2 × 30 | 1.200 |
| Pembayaran | 10 × 2 × 30 | 600 |
| Cadangan (edit, hapus, export) | — | 500 |
| **Total** | | **≈ 4.700 / 10.000 (47%)** |

Skenario berat (300 absensi/hari + 50 buka halaman):

| Komponen | Simple ops/bulan | Advanced ops/bulan |
|----------|------------------|--------------------|
| Bootstrap | 6.000 | 0 |
| Simpan (batch 5) | 3.600 | 1.800 |
| Pembayaran | 1.800 | 600 |
| **Total** | **≈ 11.400 → LEWAT** | **≈ 2.400 → LEWAT** |

**Kesimpulan penting:** di skenario berat yang jebol lebih dulu adalah **Advanced
ops (2.000)**, bukan Simple. Penyelamatnya: perbesar batch simpan dari 5 → 10
entri (Advanced turun 50%) dan hindari klik "Lunasi" satu per satu untuk banyak
tagihan (pakai Lunas Masal: 10 tagihan = tetap 1 put).

### Status sekarang (15 Nov 2026, deploy v38)

- Log absensi: 0 (baru dibersihkan)
- Anggota: 724 · LIS: 28
- Ukuran blob: `db/logs.json` ≈ 0 KB, master 168 KB, lis 6 KB
- Estimasi pemakaian: < 5% dari limit Hobby

### Jeda blob ~20 detik (read-after-write) dan cara mengakalinya

Vercel Blob tidak instan konsisten: setelah `put`, `get` dari edge lain masih bisa
mengembalikan versi lama. Diukur di live: entri baru sempat terbaca 0, muncul
lengkap setelah **18–25 detik**. Dulu ini terasa seperti "data hilang" lalu
"balik lagi" karena `applyCloudLogs()` menimpa cache lokal mentah-mentah.

Akalan v38 — **nol operasi blob tambahan**:

| Lapis | Tempat | Fungsi |
|-------|--------|--------|
| Cache RAM write-through | `api/index.js` (`_logsMem`) | Instance yang baru menulis langsung membaca datanya sendiri; baca blob di-cache 5 detik; hasil baca digabung (union) dengan tulisan terakhir < 5 menit |
| Union di klien | `js/spa.js` (`applyCloudLogs`) | Entri yang dicatat di perangkat ini (maks 30 menit) tidak dihapus oleh snapshot cloud yang telat |
| Tombstone hapus | `js/spa.js` (`lis2627_cleared_at`) | Setelah "Hapus Semua Data", snapshot cloud yang lebih tua dari waktu hapus diabaikan → data lama tidak bisa muncul lagi |

### Kalau kuota habis
Vercel **memblokir** akses Blob selama 30 hari (bukan menagih). Aplikasi tetap bisa dibuka tapi data tidak bisa disimpan/dibaca dari cloud.

---

## 6. Saran

Prioritas tinggi:
1. **Jangan input satu-satu beruntun lebih dari 5 detik** — pakai input massal atau biarkan antrian terkumpul. Ini yang paling menghemat ops.
2. **Jangan klik "Hapus Semua Data" tanpa alasan** — 2 put per klik, plus butuh password server.
3. **Backup mingguan** lewat tombol "Unduh Semua Data (CSV)" sebelum operasi besar.

Prioritas sedang:
4. **Pisah blob log per bulan** (`db/logs-2026-11.json`) kalau log sudah > 3.000 baris. Membaca 1 blob besar memperlambat bootstrap dan memperbesar data transfer.
5. **Tambahkan cache 30 detik untuk `bootstrap`** di edge kalau pengguna sering refresh berulang. Risiko: data baru telat tampil.
6. **Ganti password default** `123456`, `2627`, dan `LIS26-27` sebelum dipakai orang banyak.

Prioritas rendah:
7. Pindahkan `data/master.json` (168 KB) ke CDN cache immutable — sudah otomatis karena file statis.
8. Tambah `robots.txt` + `noindex` kalau web tidak ingin terindeks Google.
9. Pertimbangkan upgrade ke Vercel Pro (USD 20/bln) hanya kalau pemakaian > 8.000 simple ops/bulan secara konsisten.

---

## 7. Troubleshooting Cepat

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| Data balik setelah hapus | Snapshot blob telat + cache lokal lama | Sudah ditangani v38 (tombstone `lis2627_cleared_at` + union). Kalau masih: klik "Bersihkan Cache", hard refresh Ctrl+Shift+R |
| Entri baru hilang lalu muncul sendiri | Jeda read-after-write blob 18–25 detik | Normal; v38 menyembunyikannya (cache RAM + union). Jangan panik input ulang |
| Tagihan naik padahal tidak bayar/hapus apa pun | Entri sama tampil dua kali: lokal `pengabsen:""` vs cloud `pengabsen:"Admin"` | v38.1 — kunci union hanya `tgl\|stambuk\|nama\|bahasa`, tidak lagi memakai pengabsen/kamar/ucapan |
| Data balik lagi setelah "Hapus Semua Data" (muncul belakangan) | Cache RAM server (5 menit) membangkitkan log yang sudah dihapus | v38.2 — union RAM hanya 3 detik pasca-tulis, `clearall` me-reset `_logsMem`/`_logsReadAt`/`_lastDedupeAt` |
| Tombol di HP susah dipencet | Font html dikecilkan 11.5–13px (v27) | Sudah diperbaiki v38: target sentuh minimal 40px |
| Tagihan naik sendiri | Log duplikat lama | Admin → `dedupe_logs`, atau hapus semua data |
| PIN selalu salah | PIN lokal diganti, beda dari server | Isi Server Pass `LIS26-27` di Pengaturan; lunasi/ekspor/CRUD normalnya cukup PIN `2627` |
| Web lambat | Cache browser penuh / blob besar | Bersihkan cache, cek jumlah log |
| Autofill pengabsen kosong | Daftar LIS belum termuat | Tunggu bootstrap, atau cek panel Database LIS |
| Tombol tidak bisa diklik | Overlay gate masih tampil | Hard refresh; gate butuh login dulu |

---

## 8. Struktur File

```
index.html              # shell SPA + modal + gate login
RINGKASAN.md            # dokumen ini
css/app.css             # layout utama + responsive (mobile diatur di sini)
css/theme.css           # dark/light
js/spa.js               # logika utama (state, render, sync, batch)
js/api.js               # wrapper fetch ke /api
js/auth.js              # gate login + ganti password
js/db.js                # panel CRUD database
js/rekap.js             # rekap harian + export
js/xlsx-writer.js       # generator XLSX tanpa dependency
js/theme.js             # toggle tema
api/index.js            # serverless function (semua endpoint)
data/master.json        # 724 anggota (statis, CDN)
data/lis.json           # 28 petugas LIS (statis, CDN)
vercel.json             # config routing + function
```

---

## 9. Riwayat Revisi dari Awal

Urut dari yang paling lama. Nomor `#n` = Pull Request di GitHub.

### 11 Nov 2026 — cetak biru
- **Initial commit** — repo kosong, struktur dasar aplikasi absensi.

### 12 Nov 2026 — versi satu file
- **Initial commit absensi-web** — semua HTML/CSS/JS dalam satu halaman, data di localStorage.
- **Merge initial commit** + **Teks ucapan default `None`** — kolom ucapan tidak lagi kosong, Enter di kolom ucapan langsung submit.

### 13 Nov 2026 — pecah multi-file + fitur inti
- **#1 upgrade multi-file** — `index.html` + `css/` + `js/` dipisah; dashboard grafik, modul pembayaran (denda), panel Database CRUD, tema terang/gelap neo-brutalisme.
- **#2 `?theme=light|dark`** — pratinjau tema lewat URL untuk link yang dibagikan.
- **#7 popup informasi awal** — popup sambutan (bukan popup PIN), merge + backfill data lama, nama petugas absen netral, ukuran font 100%.
- **#8 popup info terang di dark** — kontras diperbaiki.
- **#9 pengabsen dari LIS + migrasi log lama** — daftar petugas piket diambil dari database LIS, log format lama dimigrasi otomatis.
- **#10 popup tidak bergantung Tailwind** — CSS mandiri + cache-bust, popup tetap rapi walau CDN Tailwind gagal.
- **#11–#12 hemat & paralel** — master + LIS diambil paralel, backfill non-blocking, cache master/LIS di localStorage, pembayaran jadi 1 blob.
- **#13 satu blob log + LIS masal** — semua log absensi pindah ke `db/logs.json` (bukan 1 file per hari), data statis dari repo, lunas masal, status *hidden payment*.
- **#14 duplikat log bikin saldo dobel** — dedupe berbasis konten (`tgl|stambuk|nama|bahasa|ucapan|kamar|pengabsen`).
- **#15 statistik per rayon kosong** — agregasi rayon diperbaiki.
- **#16 autofill petugas penerima bayar** di modal lunas.
- **#17 autofill hapus capslock + sinkron DB**.
- **#18 login gate + ganti password** — halaman dikunci password `123456` (bisa diganti di Pengaturan).
- **#19 tombol login gate tidak bisa diklik** — overlay/`z-index` diperbaiki.
- **#20 bootstrap 1 request** — master + LIS + log + pembayaran digabung satu panggilan, render dari data statis dulu.
- **#21 tagihan naik gara-gara `pay` key mismatch + default pengabsen kosong** — kolom pengabsen tidak lagi terisi otomatis.
- **#22 `no-store` + perbaikan key pembayaran** — tagihan tidak lagi naik setelah reload.
- **#23 cloud jadi sumber tunggal** — cache lokal >250 baris dibuang (indikasi duplikat).
- **#24 cache lokal >250 baris + tarif key v2 (2000)** — tarif denda dipisah per versi supaya tidak konflik dengan nilai lama.
- **#25 clearall bersihkan store baru + mobile responsive** — hapus semua data juga membersihkan blob pembayaran.
- **#26 tombol "Bersihkan Cache Peramban"** + perbaikan responsif.
- **#27 mobile scale down** — font html dikecilkan (13px / 11.5px). **Belakangan ini justru jadi sumber keluhan "mepet/rapat"** dan dibalik di v38.
- **#28–#30 alur hapus data** — prompt password server dipisah dari PIN, validasi PIN diperbaiki, tombol hapus tidak lagi tanpa gate.
- **#31 batch sync absensi (`save_bulk`)** — 5 entri = 1 request (hemat Advanced ops).
- **#32–#33 hemat `list` + `readBlob` cache-bust** — `list` hanya saat migrasi, pembacaan blob tidak kena cache CDN.
- **#34 baca blob privat pakai stream** — konsisten, tidak lagi bergantung `fetch` biasa.
- **#35 dokumen ringkasan fitur + rekap kuota Vercel** (`RINGKASAN.md` versi pertama).
- **#36 ekspor XLSX/CSV semua tanggal** — dulu hanya sebagian baris yang ikut terekspor.

### 14 Nov 2026 — audit menyeluruh
- **#37 enam temuan audit**:
  1. Anggota berstatus `Nonaktif` tidak lagi muncul di input, daftar massal, dan daftar pengabsen (badge 724 → 723 aktif).
  2. Server menerima **PIN `2627` atau Server Pass `LIS26-27`** untuk aksi harian; **Hapus Semua Data tetap wajib Server Pass**. Keluhan "PIN selalu salah" hilang.
  3. Guard duplikat di klien (`isDuplicateEntry`) — entri kembar ditolak dengan toast, bukan diam-diam dobel.
  4. "Bersihkan Cache" membersihkan semua kunci (log, master, LIS, antrian sync, tarif, PIN, sesi, tema) + `sessionStorage`.
  5. Empat file mati dihapus (`js/app.js`, `js/script.js`, `js/master-data.js`, `css/style.css` — 229 KB, tidak pernah dimuat).
  6. Label kolom password diperjelas ("PIN Admin / Server Pass").
- **PR #38** — dokumentasi password diperbarui (PIN vs Server Pass).

### 15 Nov 2026 — v38 (diuji pakai browser engine)
Diuji langsung di browser sungguhan (Edge headless + CDP) pada layar 390x844 dan desktop.

- **Jeda blob 18-25 detik diakali** — cache RAM write-through di server + union di klien + tombstone hapus. Nol operasi blob tambahan.
- **Layout HP diperbaiki dari akar** — font html dikembalikan ke 15px (bukan 11.5px), target sentuh tombol/input/ikon minimal 40px, font sidebar 0.85rem, tombol tutup sidebar 40px.
- **"Pilih Semua" tagihan dipindah ke header tabel** — sebelumnya ada di dalam bar yang baru muncul setelah satu baris dicentang (tidak bisa dipakai duluan). Sekarang memilih semua baris yang sedang tampil (mengikuti filter), lengkap dengan status *indeterminate*.
- **Koreksi dokumen kuota** — `put` dihitung **Advanced**, bukan Simple (tabel lama salah). Ditambah skenario berat: Advanced (2.000) jebol lebih dulu daripada Simple (10.000).
- Versi aset dinaikkan ke `?v=38` supaya semua perangkat mengambil CSS/JS baru.

#### v38.1 — entri dobel setelah reload (PR #41, #42)
Uji di browser: simpan 1 entri → lokal 4, cloud 4, tapi setelah reload jadi **5**.
Penyebab: server mengisi `pengabsen` default `"Admin"`, klien menyimpan `""`. Kunci
union lama ikut menghitung `pengabsen`, `kamar`, dan `ucapan`, jadi entri yang sama
dianggap dua entri berbeda → total tagihan naik sendiri.
- `logSig()` sekarang `tgl|stambuk|nama|bahasa` saja (identitas sebenarnya: satu orang,
  satu tanggal, satu bahasa). `isDuplicateEntry` di klien tetap memakai kunci yang sama.
- Badge PIN sidebar dinaikkan ke 34px dan checkbox diperbesar (PR #42 menaikkan aset ke `?v=39`).

#### v38.2 — cache RAM membangkitkan log yang sudah dihapus (PR #43)
Uji: "Hapus Semua Data" → toast sukses, lokal 0, tapi `GET /api?action=logs` tetap **5**
lebih dari 30 detik. Penyebab: `clearall` menulis blob kosong tapi **tidak** mengosongkan
cache RAM; instance lain masih menggabungkan RAM (5 menit) ke blob kosong, dan auto-dedupe
bisa menulis hasil gabungan itu balik ke blob.
- `LOGS_MEM_FRESH` 300.000 ms → **3.000 ms** (union RAM hanya jendela write-through).
- Setelah baca blob, `_logsMem.at` di-set `0` (RAM hasil baca tidak boleh dipakai untuk union).
- `clearall` me-reset `_logsMem`, `_logsReadAt`, `_lastDedupeAt` sebelum menulis.
- Hasil uji: hapus → lokal 0, server 0, tetap 0 setelah 3 reload (60 detik).

#### v40 — sisa temuan visual HP (PR #45)
- Checkbox header/bulk/baris 20px → **22px** dengan sel tabel `min-height: 40px` (area sentuh).
- `.overflow-x-auto` diberi `-webkit-overflow-scrolling: touch` (scroll tabel halus di HP).
- Hasil ukur di 390x844: font html 14px, `scrollWidth` = 390 (tidak ada geser horizontal),
  0 error konsol, simpan 2 entri → reload tetap 2, hapus → 0 dan tetap 0.

#### v41 — antrian sinkron otomatis (PR #47)
Dulu entri baru dikirim kalau antrian mencapai **5** atau tab ditutup (`pagehide`). Kalau
petugas input 1-4 entri lalu menutup browser paksa, entri hanya ada di localStorage
device itu dan belum masuk server.
- `flushPendingThrottled()` — kirim antrian walau baru 1 entri, **maksimal 1 request per 30 detik**.
- Pemicu: timer 30 detik (hanya saat tab terlihat), pindah menu, tab kembali terlihat,
  event `online`, dan tetap ada flush saat tab ditutup.
- Hasil uji browser: (a) simpan 1 lalu tab ditutup mendadak → saat dibuka lagi server naik 1;
  (b) simpan 1 lalu tunggu 37 detik → server naik 1 tanpa disentuh;
  (c) simpan 1 lalu pindah menu → server naik 1 dalam 4 detik. 0 error konsol.
- Kuota: tetap 1 put per kirim (Advanced), hanya lebih cepat, bukan lebih sering.
#### v51 — backend pindah ke Cloudflare D1, lepas Vercel tanpa kartu (PR #69-#71)
- **Kenapa**: Cloud Run / Firebase Functions butuh kartu debit. Cloudflare Pages +
  Functions + D1 semuanya gratis tanpa kartu, tanpa billing, tanpa file kunci JSON.
- **Store baru** `lib/store-d1.js`: tabel `logs` (1 baris per entri, JSON utuh di
  kolom `data`), `pay` (kunci `tgl__stambuk`), `meta` (master anggota/pengurus).
  Tulis pakai `batch` 100 baris; `INSERT OR REPLACE` jadi idempoten.
- **Driver otomatis**: binding `env.DB` ada → `d1`; `DB_DRIVER=firestore` →
  Firestore; selain itu Blob lama. `api/index.js` tetap satu-satunya backend.
- **Adapter Cloudflare** `functions/api/[[path]].js` menjembatani Request/Response
  ke gaya Node (req,res), jadi kode yang sama jalan di Vercel, `server.js`, dan Worker.
- `@vercel/blob` dimuat lewat `module.require` supaya tidak ikut di-bundle ke Worker.
  (Catatan: `eval('require')` gagal di scope CJS dan sempat bikin logs terbaca 0.)
- Aksi baru: `dump` (salinan mentah logs+pay+master) dan `migrate_d1` (Server Pass).
  Skrip `scripts/migrate-to-d1.js` memindahkan semua data lama dan memverifikasi jumlah.
- Uji lokal `wrangler pages dev` + D1 lokal: master 724, migrasi 121 log + 62 tagihan +
  724 anggota + 28 pengurus, `verified: true`, 53 status lunas ikut; save, save_bulk
  8 paralel (8/8 masuk), pay/unpay, hidden_bulk, deleteLog, dedupe, export 122 — semua 200.
  `logs` 21 ms, `bootstrap` 55 ms.
- **Bug lama ketemu**: `readPaymentsFresh` hilang waktu refactor v48, jadi pay/unpay/
  toggle_hidden/hidden_bulk balas 500 sejak v48. Dipulihkan di PR #71 — sudah live.

#### v50 — backend Firestore + server mandiri (PR #66-#68)
- `lib/firestore.js` (REST + JWT RS256, tanpa dependency), `DB_DRIVER=firestore`,
  `action=migrate_firestore`, `server.js` + `Dockerfile`, `firebase.json` +
  `scripts/build-static.js`, `MIGRASI-GOOGLE-CLOUD.md`.
- Tidak diaktifkan di produksi: Cloud Run/Firebase Functions butuh billing berkartu.

#### v49 — web lega lagi: baca blob tidak berlipat (PR #65)
- **Kenapa v48 terasa berat**: tiap simpan memanggil `readLogsFresh()` (baca paksa
  dari blob = 1 list `db/entry/` + baca SEMUA file entry), dan tiap flush klien
  membaca ulang seluruh `action=logs` (~54 KB) untuk verifikasi antrian. Makin
  banyak input hari itu, makin berat.
- Perbaikan:
  - `save` / `save_bulk` cukup pakai cache RAM write-through untuk cek `client_id`,
    tidak lagi baca paksa blob. Simpan jadi 1 tulis saja.
  - `save_bulk` membalas `acked` (daftar id yang sudah pasti tersimpan). Klien
    memotong antrian dari jawaban itu — request `logs` tambahan per flush hilang.
  - Cache baca 5 dtk → 10 dtk.
  - Compaction diberi penjaga `_compacting` supaya tidak jalan dobel.
- Hasil ukur live: simpan 0,42-1,4 dtk (dulu 2-3,5 dtk + baca penuh tiap simpan);
  `logs` 0,43 dtk, `bootstrap` 0,69 dtk; uji UI 1 absen → hanya 1 request
  (`save_bulk`), tanpa `logs`, antrian kosong dalam 6 dtk.

#### v48 — simpan absensi append-only, entri terakhir tidak hilang lagi (PR #60-#62)
- **Penyebab entri hilang**: `db/logs.json` di Vercel Blob baru terbaca konsisten
  18-25 detik setelah ditulis. Semua jalur simpan memakai pola baca-ubah-tulis:
  request kedua membaca versi lama (belum ada entri pertama) lalu menulis seluruh
  snapshot tanpa entri itu. Server tetap menjawab `ok`, jadi di layar seolah
  tersimpan padahal hilang. Uji 8 `save_bulk` serentak sebelum perbaikan: hanya
  1/8 yang bertahan.
- Kunci tulis per instance (v46) dan verifikasi tulis (v47) tidak cukup: dua
  request bisa mendarat di instance Vercel berbeda dan sama-sama membaca versi lama.
- Perbaikan v48 — simpan tidak lagi menyentuh satu file bersama:
  - `save` / `save_bulk` menulis file sendiri `db/entry/e-<waktu>-<acak>.json`
    (append-only, 1 tulis, tanpa baca dulu). Dua simpan berbarengan mustahil saling
    menimpa.
  - Hapus log menulis penanda `db/entry/d-<waktu>-<acak>.json`, bukan menulis ulang
    snapshot. Instance yang baru menghapus juga menyimpan daftar id terhapus di RAM
    (90 detik) supaya blob yang masih basi tidak menghidupkannya lagi.
  - Baca (`logs`, `bootstrap`, `export`) = snapshot `db/logs.json` + semua file entry,
    dedupe by id, buang yang bertanda hapus, cache RAM 5 detik.
  - Compaction otomatis: kalau file entry lebih dari 40, snapshot ditulis ulang lalu
    file entry dibuang. Compaction **dilewati** kalau ada file entry yang gagal
    dibaca (kalau tidak, isinya bisa terhapus sebelum masuk snapshot).
  - `clearall` dan dedupe tetap menulis snapshot penuh lalu membuang file entry.
  - `action=ping` sekarang mengembalikan `version` supaya deploy bisa dipastikan.
- Klien: antrian hanya dikosongkan untuk entri yang benar-benar sudah muncul di
  `action=logs`; sisanya dikirim ulang otomatis (server tolak dobel lewat `client_id`).
  Flush tetap 4 detik setelah entri terakhir + `keepalive` saat tab ditutup.
- Hasil uji live: 8 `save_bulk` serentak → 8/8 tersimpan dalam 5 detik; 45 simpan
  berurutan → 45/45 dan total tidak berubah setelah compaction; uji UI (2 absen
  beruntun lalu tab langsung ditutup) → keduanya masuk server lewat beacon.
  Data uji dihapus, total log kembali 112.

#### v43 — hide massal tidak balik lagi + filter tanggal tagihan + XLSX urut kelas (PR #51)
- **Penyebab hide "undo sendiri setelah refresh"**: status hidden/lunas disimpan di
  `db/pay.json`, dan blob itu baru terbaca konsisten 18-25 detik setelah ditulis.
  Dulu tiap baris di-hide lewat request sendiri; request kedua membaca blob basi
  (belum ada hide pertama) lalu menulis ulang seluruh map tanpa hide sebelumnya.
  Hasilnya hanya hide terakhir yang bertahan, sisanya hilang setelah refresh.
- Perbaikan server: `readPayments()`/`writePayments()` sekarang pakai cache RAM
  write-through (`_payMem`, jendela segar 5 detik). Tulisan langsung terbaca
  request berikutnya, jadi hide berurutan tidak saling menimpa. Saat membaca blob,
  isi RAM di-union dengan `updated_at` terbaru menang.
- Perbaikan klien: tombol **HIDE** / **UNHIDE** di bilah massal mengirim SATU
  request `hidden_bulk` untuk semua baris terpilih (1 Advanced op, bukan N).
- Aksi baru `hidden_bulk` (password admin): set `hidden` true/false eksplisit untuk
  banyak `{tgl, stambuk}` sekaligus.
- `clearall` sekarang juga me-reset `_payMem` supaya status hidden tidak "hidup lagi"
  dari cache setelah data dikosongkan.
- **Filter per tanggal di menu Tagihan**: dropdown `#tag-tgl-filter` otomatis diisi
  tanggal yang ada (terbaru di atas) dan bisa digabung dengan filter status/rayon/cari.
  Tombol Reset Filter ikut mengosongkannya. v45: dropdown diberi listener `change`
  sendiri — sebelumnya memilih tanggal tidak langsung menyaring (harus geser filter
  lain dulu). Uji live: pilih 2026-11-14 -> 101 baris jadi 3 baris tanggal itu saja,
  kosongkan -> balik 101.
- **Ekspor XLSX/CSV urut kelas tertinggi**: `sortByKelas()` mengurutkan kelas 3 → 2 → 1
  (angka maupun romawi), lalu nama A-Z, lalu jam catat.
- Hasil uji live v44: 5 toggle berurutan tanpa jeda → 5/5 hidden bertahan; bulk hide
  3 tagihan → tetap 3 hidden setelah refresh penuh; bulk unhide 5 → 5 tampil lagi;
  XLSX 2026-11-15 urut `3,3,...,2,II,1`. Data uji dihapus, total log kembali 104.

#### v42 — absen dobel boleh, tanggal ekspor tanpa jam (PR #49)
- **Absen dobel sekarang boleh.** Orang sama, tanggal sama, bahasa sama bisa dicatat
  berkali-kali (dua pelanggaran berbeda di hari yang sama). Toast peringatan
  "sudah tercatat — tidak dicatat dobel" dihapus, termasuk di absen massal.
- Pengaman yang tersisa hanya untuk **kiriman ulang jaringan**: klien mengirim `id`
  per entri, server menyimpannya sebagai `client_id` dan menolak entri dengan
  `client_id` yang sudah ada. Jadi retry tidak menggandakan, tapi klik baru tetap
  tercatat walau isinya sama persis.
- Penggabungan cloud + lokal sekarang **ala multiset**: jumlah entri per kunci
  diambil yang terbesar antara cloud dan lokal. Entri kembar yang disengaja tetap
  utuh, entri baru yang belum muncul di cloud tetap tampil, duplikat lama tetap 1.
- **Tanggal ekspor date-only**: XLSX memakai format `dd-mm-yyyy` tanpa jam, CSV
  rekap & tagihan memotong tanggal jadi `YYYY-MM-DD` (10 karakter). Kolom jam
  terpisah (kalau ada) tidak diubah.
- Hasil uji live: 3 entri identik (orang+tanggal+bahasa sama) tersimpan 3, server
  naik 3, setelah reload lokal 46 = server 46, antrian 0. XLSX live: `formatCode="dd-mm-yyyy"`,
  tidak ada token jam. Data uji sudah dihapus (`deleteLog`), sisa 41 entri asli.


### 17 Nov 2026 — v52: cuma D1, sampah jalur mati dibuang

- `api/index.js` sekarang **satu driver: Cloudflare D1 (SQLite)**. Cabang Blob,
  Firestore, dan filesystem dibuang. Tanpa binding `env.DB` server balas 503
  dengan pesan jelas, bukan diam-diam menulis ke memori.
- `lib/firestore.js`, `vercel.json`, `.vercelignore` dihapus. Sebelumnya juga sudah
  dibuang `server.js`, `Dockerfile`, `.dockerignore`, `firebase.json`,
  `.firebaserc`, `MIGRASI-GOOGLE-CLOUD.md`, `deploy.sh`, `data/logs.json`.
- Tidak ada lagi cache RAM status bayar: `readPayments()` selalu baca D1, jadi
  pay/unpay langsung konsisten di request berikutnya.
- `SERVER_VERSION`/`?v=` naik ke **v52**.
- Kolom **Petugas Pengabsen wajib**: kirim laporan ditolak (toast merah + field
  disorot) kalau nama pengabsen kosong, dan kolom otomatis dikosongkan setelah
  laporan tersimpan (satuan maupun massal).
- Uji lokal `wrangler pages dev`: ping v52 driver d1, save/duplikat/dobel-sengaja,
  save_bulk, logs, pay/unpay, hidden_bulk, bootstrap (724 master/28 lis), export,
  dump, deleteLog — semua 200.

### 17 Nov 2026 — v53: Vercel dibuang total, semua di Cloudflare + D1

- `vercel.json` dihapus dari repo; dependency `@vercel/blob` dicabut dari `package.json` + `package-lock.json` (kode tidak memakainya) -> nol sisa Vercel di proyek.
- `SERVER_VERSION` naik ke `v53`, cache-busting `?v=53` (9 file) supaya browser ambil build baru.
- DNS zona `experimentlynss.my.id` bersih: CNAME `www`, `@`, `*` -> `mutajawwiz.pages.dev` (proxied). Record `_domainconnect.vercel-dns.com` (sisa Vercel) dihapus, record uji (`webtest`, TXT `zonetest-*`) dihapus.
- `www.experimentlynss.my.id` **terverifikasi jalan lewat Cloudflare** dari DNS publik (Google DoH: 104.21.1.175 / 172.67.129.171). Jawaban "IP Vercel" sebelumnya cuma cache resolver lokal/ISP, bukan masalah DNS.
- Fitur lama tidak disentuh: pengabsen wajib + auto-kosong (satuan & massal), hidden bulk, filter tanggal/status/rayon tagihan, ekspor XLSX urut kelas tertinggi + tanggal tanpa jam, hapus data wajib server password, popup info awal, anti-dobel dimatikan, backend cuma D1.

### 17 Nov 2026 — v54: master + LIS jadi tabel SQL betulan, JSON terakhir dihapus

- Tabel D1 baru: `anggota(id, nama, kelas, stambuk, rayon, status, data)` dan `lis(id, nama, kelas, stambuk, section, status, data)`. Kolom asli bisa di-query pakai SQL; `data` tetap JSON utuh per baris supaya field tambahan (kamar, tingkat, alamat, ...) tidak hilang.
- `data/master.json` + `data/lis.json` **dihapus dari repo**; isinya dipindah ke `db/seed-master.sql` (752 baris INSERT) lalu dijalankan sekali ke D1. `api/index.js` tidak lagi `require` file JSON apa pun.
- Frontend tidak fetch `data/*.json` lagi: master/LIS diambil dari API (`bootstrap`, `master`, `lis`) dengan cache localStorage sebagai fallback offline.
- CRUD master/LIS (`db-save`/`db-delete`) sekarang menulis satu baris (`INSERT OR REPLACE` / `DELETE`) — bukan baca-semua lalu tulis ulang.
- `scripts/build-static.js` tidak menyalin folder `data` lagi. Versi `v54`, `?v=54` (9 file).
- Hasil cek D1 setelah migrasi: anggota 724, lis 28, logs 121, pay 62.

### 17 Nov 2026 — bersih-bersih folder + deploy 1 perintah

Isi repo sekarang cuma yang dipakai runtime/build:

```
index.html  css/  js/  api/  lib/  functions/  db/  scripts/
wrangler.toml  package.json  package-lock.json
RINGKASAN.md  CLOUDFLARE-D1.md  .gitignore  .gitattributes
```

Dihapus/diabaikan (otomatis dibuat ulang, jangan di-commit): `dist/`, `.wrangler/`, `node_modules/`, `db/backup*.sql`, `*.log`.

Cara edit + deploy ulang (tanpa bersih-bersih):

```
npm run deploy          # build dist/ lalu deploy ke Cloudflare Pages
```

Kalau muncul `stdin is not a tty` (jalan dari tool non-interaktif), pakai:

```
npm run deploy < /dev/null
```

Perintah database:

```
npm run db:sql -- "select count(*) from logs"
npm run db:backup       # db/backup.sql (gitignore)
npm run db:init         # bikin tabel kalau kosong
npm run db:seed         # isi ulang master/LIS dari db/seed-master.sql
npm run dev             # server lokal 8788 + D1 lokal
```

### 17 Nov 2026 — v55-v57: zoom out 22% (desktop) + HP lebih rapi

Skala tampilan diatur lewat `font-size` root (Tailwind pakai rem, jadi teks, padding, gap, lebar komponen ikut mengecil proporsional):

| Layar | `html` font-size | Efek |
|---|---|---|
| Desktop ≥769px | `78%` (12.48px) | zoom out 22% |
| HP ≤768px | `14px` (dari 15px) | lebih lega, tidak mepet |
| HP ≤400px | `13.5px` (dari 14px) | ekstra kecil |

Penyesuaian pendukung:
- `.max-w-7xl` → `118rem` di desktop, supaya layar lebar tetap terpakai (bukan kolom sempit di tengah).
- Token `--muted` didefinisikan (sebelumnya dipakai di HTML tapi tidak pernah ada nilainya).
- HP: judul topbar 1 baris + ellipsis, tombol ikon 38px seragam, padding kartu seragam, tombol mode input full-width, filter tagihan jadi 2 kolom (dropdown terakhir full width), modal/popup maks 90-96vw.
- Diverifikasi: 6 halaman × 2 viewport (1440×900, 390×844) — `scrollWidth == innerWidth` di semua kombinasi, nol overflow horizontal.

### 17 Nov 2026 — v59-v60: hilang kedip konten sebelum gerbang login + sesi 30 hari

Keluhan: tiap buka web, dashboard sempat kelihatan sekejap lalu baru muncul halaman password.

Penyebab: `#login-gate` punya class `hidden` di HTML, jadi konten sudah dilukis dulu; gerbang baru ditampilkan setelah `js/auth.js` jalan di akhir body.

Perbaikan:
- Gerbang login **tampil sejak lukisan pertama** (class `hidden` dibuang dari markup, `#login-gate{display:flex}` di CSS, `html:not(.authed) body{overflow:hidden}`).
- Script kecil di `<head>` (render-blocking, jalan sebelum body) menambah class `authed` ke `<html>` kalau sesi masih valid → pengguna yang sudah login tidak melihat gerbang sama sekali.
- `gate(true/false)` di `js/auth.js` sekarang juga mengatur class `authed`, jadi tampil/sembunyi selalu konsisten.
- Sesi login diperpanjang: `sessionStorage` (per tab) + `localStorage['lis2627_authed_until']` = **30 hari**, jadi tidak perlu mengetik password tiap buka web. Logout / "Bersihkan Cache" menghapus keduanya.
- Hint "Password default: 123456" otomatis disembunyikan setelah password diganti.

Verifikasi (Edge headless, profil bersih, 3 skenario): tanpa sesi → gerbang `display:flex`, `z-index 9999`, menutup seluruh viewport, `elementFromPoint` = area gerbang, body terkunci; sesi valid → gerbang `display:none`, `html.authed`, dashboard tampil; sesi kedaluwarsa → gerbang tampil lagi. Hasil: LULUS.

### 17 Nov 2026 — v61: sesi tetap per-tab (permintaan: tutup browser = password lagi)

Sesi 30 hari dari v60 dibatalkan. Aturannya sekarang:
- Login disimpan di `sessionStorage` saja → **refresh/reload tab tetap masuk**, tidak minta password.
- Tab/browser ditutup → sesi hilang, buka lagi **wajib password**.
- Kunci lama `lis2627_authed_until` (localStorage, sisa v60) diabaikan dan dibersihkan otomatis saat login/logout, jadi yang sempat dapat sesi 30 hari tidak "nyangkut" masuk.
- Perbaikan anti-kedip dari v59/v60 tetap berlaku (gerbang tampil sejak lukisan pertama, class `authed` di `<html>`).

Verifikasi (Edge headless, profil bersih): belum login → gerbang tampil menutup konten; sesi ada di tab → `display:none`, dashboard tampil; sesi hilang + sisa kunci v60 masih ada di localStorage → gerbang tampil lagi. Hasil: LULUS.

### 17 Nov 2026 — v62: password gerbang web pindah ke server (D1), sama di semua PC

Keluhan: password diganti di satu PC, di PC lain tetap default. Penyebabnya password gerbang disimpan di `localStorage` (`lis2627_web_pass_v2`) — itu per-browser, jadi tidak mungkin ikut ke PC lain.

Sekarang password gerbang disimpan di D1, tabel `meta`, key `webpass`, isinya `{salt, hash}` dengan `hash = sha256(salt + password)`. Password asli tidak pernah ditulis ke DB dan tidak pernah dikirim balik ke browser.

Endpoint baru:
| Aksi | Fungsi |
|---|---|
| `GET ?action=webpass` | status: `{custom:true/false}` (untuk sembunyikan hint default) |
| `POST ?action=webpass_verify` `{password}` | cek password, 200 kalau cocok / 401 kalau salah |
| `POST ?action=webpass_set` `{old,new}` | ganti password (wajib password lama, minimal 4 karakter) |

Perilaku klien (`js/auth.js`):
- Login sekarang verifikasi ke server → password sama di semua PC/HP.
- Kalau server tidak terjangkau (offline), fallback ke hash lokal supaya tetap bisa masuk.
- Hint "Password default: 123456" hilang otomatis begitu server bilang `custom: true`.

Verifikasi produksi (v62): `webpass` custom=false → login `123456` 200, password ngawur 401 → `webpass_set` 200 → password lama 401, password baru 200, status custom=true → password lama salah saat ganti 401. Data uji dihapus lagi (`DELETE FROM meta WHERE k='webpass'`), jadi kondisi sekarang: **password default `123456`** dan siap diganti dari PC mana pun. Cek klien headless: gerbang tampil, hint tampil, klien memanggil `?action=webpass`, nol error konsol.

### 18 Nov 2026 — v63: tombol hapus log absen perorangan di web

Sebelumnya `?action=deleteLog` cuma ada di backend, UI nol yang manggil — hapus log harus lewat `wrangler d1 execute`. Sekarang tiap baris log punya tombol **Hapus**.

Tempat tombol:
- Dashboard → tabel "Log Masuk Hari Ini" (kolom **Aksi** baru).
- Halaman Input Absen → daftar log tanggal terpilih (mengikuti filter tanggal, jadi tanggal lampau juga bisa dihapus).

Alur klien (`hapusLogSatu(id)` di `js/spa.js`):
1. Wajib sesi PIN Admin terbuka (`isAdminUnlocked`); kalau belum, popup PIN muncul otomatis.
2. Wajib mode cloud (mode lokal ditolak, karena hapus harus di server).
3. Konfirmasi `confirm()` berisi nama, kelas, tanggal, jam, pengabsen.
4. `POST ?action=deleteLog {id_log, password}` — password = PIN/Server Pass yang sudah dipegang sesi admin.
5. Sukses: baris dibuang dari `allLogs`, entri `pendingSync` ikut dibuang (biar tidak diunggah ulang), localStorage disimpan, semua tampilan di-render ulang.

Verifikasi produksi v63: log uji `ZZ TEST HAPUS` (tgl 2026-11-18) dibuat lewat API → headless Edge klik tombol Hapus di dashboard → baris hilang, toast "Log absen dihapus.", `bootstrap` balik 121 → 120, nol sisa nama uji. Master `anggota` 724 tidak disentuh.

### 18 Nov 2026 — v64: ENTER = kolom berikutnya, ENTER di kolom terakhir = kirim

Form input satuan sekarang bisa dipakai tanpa mouse:

| Kolom | ENTER |
|---|---|
| Tanggal | fokus ke Petugas Pengabsen |
| Petugas Pengabsen | fokus ke Cari Nama / Stambuk |
| Cari Nama / Stambuk | fokus ke Ucapan (kalau anggota sudah terpilih) |
| Ucapan (kolom terakhir) | **kirim laporan** = klik Simpan |

Detail perilaku (`initEnterChain()` di `js/spa.js`, listener `keydown` di `#mode-satuan`):
- Kolom readonly (stambuk/kelas/rayon/kamar) dilewati otomatis karena tidak pernah dapat fokus.
- Di kolom pencarian, kalau belum ada anggota terpilih dan datalist masih punya saran, ENTER dibiarkan memilih saran dulu (perilaku browser) — ENTER berikutnya baru pindah kolom. Jadi tidak memutus autofill.
- `Shift+Enter` di Ucapan tetap bikin baris baru (tidak mengirim).
- Setelah laporan terkirim, form dikosongkan dan fokus balik ke Petugas Pengabsen supaya bisa langsung lanjut input berikutnya.

Verifikasi produksi v64 (headless Edge, login password gerbang, halaman Input): fokus awal `inp-pengabsen` → ENTER → `inp-search` → ketik nama lengkap (stambuk 24549 terisi) → ENTER → `inp-ucapan` → ENTER → laporan tersimpan (toast "Tercatat: Aldendra Aqeela Benzema"), `inp-search` + `inp-ucapan` kosong, fokus balik `inp-pengabsen`. Log uji dihapus lagi lewat `deleteLog` (bootstrap 117 → 116).

### 18 Nov 2026 — v65: kolom Petugas Pengabsen di Absen Massal

Bug: mode **Absen Massal Kamar** tidak punya kolom pengabsen sendiri. Kode lama membaca `#inp-pengabsen` milik form satuan — padahal form itu sedang disembunyikan, jadi kalau belum pernah diisi, simpan massal ditolak dengan pesan "pengabsen wajib" tanpa ada kolom yang bisa diketik (fokus malah lompat ke input tersembunyi).

Perbaikan:
- Kolom baru `#mass-pengabsen` (label "Petugas Pengabsen (Wajib)") di form massal, pakai datalist `pengabsen-list` yang sama.
- `handleMassSave()` pakai `#mass-pengabsen` dulu, fallback ke `#inp-pengabsen` (biar kompatibel).
- Pindah mode menyalin nama: satuan → massal dan massal → satuan (hanya kalau kolom tujuan masih kosong). Masuk mode massal langsung fokus ke kolom pengabsen.
- ENTER di kolom pengabsen massal → fokus ke filter cepat.
- Setelah simpan massal sukses, kolom pengabsen dikosongkan dan fokus balik ke situ (sama seperti mode satuan).

Verifikasi produksi v65 (headless Edge): prefill satuan→massal "QA Hermes" masuk, fokus otomatis `mass-pengabsen`, ENTER pindah ke `mass-search-filter`; simpan tanpa pengabsen → toast "Nama petugas pengabsen wajib diisi", border merah, fokus balik ke kolom, log tidak bertambah; isi pengabsen + centang 1 anggota → "1 anggota berhasil dicatat serentak!", kolom pengabsen kosong lagi. Log uji dihapus (`deleteLog`), bootstrap 119 → 118.

### 18 Nov 2026 — v66/v67: fitur Beli Kertas Hukuman (tambahan biaya per lembar)

Santri yang kena pelanggaran bisa **beli kertas hukuman tambahan**. Biayanya menambah tagihan: `harga per lembar x jumlah lembar`, akumulatif dengan denda yang sudah ada.

Aturan yang dipakai:
- Harga per lembar default = tarif denda aktif (kolom Tarif Indonesian, sekarang Rp 2.000), masih bisa diubah manual di modal.
- Input dari halaman **Tagihan**: tombol `+ Kertas` di baris tagihan yang belum lunas.
- Biaya nempel ke tagihan santri tanggal itu, tapi tampil sebagai **rincian sendiri**: tag `Kertas N lembar`, baris `+ Kertas 2 x Rp 2.000 = Rp 4.000`, dan di kolom nominal ada `denda Rp 2.000 + kertas Rp 4.000`.
- Tagihan yang sudah lunas/hidden tidak bisa ditambah kertas (harus batal lunas dulu).
- Entri kertas bisa dihapus per baris (`hapus` di rincian) selama tagihan belum lunas.

Teknis:
- Tabel D1 baru `kertas` (`id`, `tgl`, `stambuk`, `ts`, `data` JSON) + index `idx_kertas_tgl`; dibuat otomatis oleh `ensureSchema()` di `lib/store-d1.js`.
- Endpoint: `GET /api?action=kertas`, `POST kertas_add` (wajib PIN/Server Pass, validasi jumlah 1-200 & harga > 0), `POST kertas_del`. `bootstrap` dan `dump` sekarang ikut membawa `kertas`. `clearall` ikut mengosongkan tabel kertas.
- Harga disimpan per entri, jadi mengubah tarif di Pengaturan tidak mengubah tagihan kertas lama.
- `getConsolidatedTagihan()` di `js/spa.js` menambahkan `kertasQty`, `kertasBiaya`, `kertasItems`, dan menaikkan `totalDenda`. Karena total kas/lunas/tunggakan dashboard & laporan dihitung dari `totalDenda`, kertas otomatis ikut terhitung saat pelunasan.
- Ekspor CSV keuangan menambah kolom `Kertas_Lembar` dan `Biaya_Kertas`.
- `KERTAS` di frontend dimuat dari `bootstrap` dan di-refresh tiap masuk halaman Tagihan (`loadKertasFromCloud()`), tidak dicache di localStorage.

Verifikasi produksi v67 (headless Edge + API):
- `GET kertas` 200 (count 0 sebelum tes).
- API `kertas_add` 2 lembar x Rp 2.000 → entri `KRT-...` tersimpan; kartu tagihan Farid Evan Fadilah (2026-11-06) naik dari Rp 2.000 → Rp 6.000 dengan rincian `denda Rp 2.000 + kertas Rp 4.000`.
- UI: tombol `+ Kertas` buka modal (default 1 lembar, harga 2.000, total ikut berubah saat jumlah diganti 3 → Rp 6.000), konfirmasi → toast "Kertas 3 lembar ditambahkan (Rp 6.000)", tagihan 2.000 → 8.000; tombol `hapus` di rincian → konfirmasi → entri hilang, total balik.
- Semua entri uji dihapus lagi: `GET kertas` count 0, `logs` tetap 151.

### 18 Nov 2026 — v69: filter status bayar di export XLSX + font Times New Roman 11

- Panel **Export XLSX Template Resmi** dapat dropdown baru **Status Bayar**: `Semua status` / `Sudah bayar (lunas)` / `Belum bayar` (`#xlsx-status`).
- Filter berlaku untuk **Unduh XLSX** (rentang tanggal / semua tanggal) dan **Unduh XLSX Harian** di halaman Laporan. Kombinasi dengan filter kelas/bahasa/nama/duplikat tetap jalan.
- Filter memakai field `lunas` hasil gabung tabel `pay` (`mergePayments`), jadi statusnya sama dengan yang tampil di halaman Tagihan.
- Semua sel di file XLSX sekarang **Times New Roman 11** (header bold 11, data 11 — sebelumnya data Calibri 12), diatur di `js/xlsx-writer.js` (`fonts` font 0 & 1).

Verifikasi produksi v69 (headless Edge, rentang 2026-11-01 s/d 2026-11-18):
- `belum` → 98 baris / 9 sheet; `sudah` → 54 baris / 1 sheet; `semua` → 152 baris / 10 sheet. Angka sama persis dengan `/api?action=logs` (152 total, 54 lunas).
- `xl/styles.xml` hasil unduhan: dua font `Times New Roman` ukuran `11`.


## v70–v71 — Rekap XLSX 1-sheet + kolom duplikat + rekap pembayaran baru

Revisi ekspor XLSX sesuai permintaan: rekap log multi-tanggal jadi 1 sheet (bukan per-hari beda sheet), duplikat di kolom baru, plus fitur baru ekspor rekap pembayaran dengan filter lengkap.

### Rekap log (Export XLSX Template Resmi) — js/rekap.js buildSheets + js/xlsx-writer.js
- 1 sheet untuk semua tanggal (sebelumnya 1 sheet per tanggal). Nama sheet "Rekap Absensi".
- Duplikat dijumlah ke kolom baru Jumlah (kolom K): santri yang sama kena >1 kali di tanggal sama -> 1 baris, kolom Jumlah = berapa kali kena. Bukan 2 baris.
- Urut per kelas dari atas (kelas tertinggi dulu), lalu nama, lalu tanggal (kelasRank desc).
- Header: No | Name Of Offenders | Date | Class | Room | Speaking | Group | Jumlah.
- xlsxHarian() dan xlsxRange() tetap pakai filter status/kelas/bahasa/nama/duplikat lama. Checkbox "Hanya baris duplikat" sekarang hanya baris santri kena >1 di hari sama.
- Toast tampilkan jumlah baris terkonsolidasi (bukan raw log).
- Kolom K: col min=11, header strCell(10,1,1,'Jumlah'), data c r=K{r}. COLS diperpanjang ke K.

### Rekap pembayaran baru — panel #pay-xlsx-card di index.html, payXlsxRange() di js/rekap.js, buildPayWorkbook() di js/xlsx-writer.js
- Fitur ekspor XLSX khusus rekap pembayaran (terpisah dari rekap log), kartu biru langit di halaman Laporan.
- 1 sheet, 1 baris per tagihan (key = tanggal + santri). Duplikat pelanggaran hari sama otomatis 1 baris; jumlah pelanggaran di kolom Jumlah Kena.
- Kolom: No | Tanggal | Stambuk | Nama | Kelas | Bahasa | Jumlah Kena | Total Denda | Status Bayar | Penerima.
- Total Denda sudah termasuk biaya kertas hukuman (getConsolidatedTagihan.totalDenda).
- Filter lengkap: rentang tanggal, kelas/tingkat, bahasa (Indonesian/Javanese), nama, status bayar (Semua/Sudah/Belum). Data dari tagihan terkonsolidasi sisi klien (getBills()).
- Tagihan ter-hidden tidak masuk rekap pembayaran.
- Urut: kelas tertinggi dulu, lalu nama, lalu tanggal.
- Font Times New Roman 11.

### Verifikasi produksi v71 (headless Edge, rentang 2026-11-01 s/d 2026-11-18)
- Rekap log (status semua): 1 sheet, 141 baris (149 log mentah -> 141 baris terkonsolidasi). Header ada Jumlah. Font TNR 11. Toast "1 SHEET, 141 BARIS DIUNDUH".
- Rekap pembayaran status belum: 1 sheet, 17 baris. Cocok api logs (17 tagihan belum lunas non-hidden).
- Rekap pembayaran status semua: 1 sheet, 90 baris (= 90 tagihan non-hidden total).

Commit: fc76d6f (pushed). Produksi https://mutajawwiz.pages.dev = v71.


## v72 — XLSX A4 narrow + rapi (freeze/filter/fit) + penerima pembayaran jadi "ellerick"

### Page setup A4 narrow di semua template XLSX
Kedua builder (`buildSheetXml` rekap log + `buildPaySheetXml` rekap pembayaran) sekarang sisipkan page setup lewat helper `pageOpen(lastCell)`, `filterXml(ref)`, `printXml()` di `js/xlsx-writer.js`:
- **A4** (`paperSize="9"`, portrait).
- **Margin narrow** (preset Excel Narrow): left/right 0.25, top/bottom 0.75, header/footer 0.3.
- **Fit to width** (`fitToWidth="1" fitToHeight="0"`) — semua kolom muat 1 halaman lebar, panjang bebas.
- **Freeze header row** (`<pane ySplit="1" topLeftCell="A2" state="frozen"/>`) — header tetap kelihatan saat scroll.
- **AutoFilter** di seluruh range (`<autoFilter ref="A1:K{last}">` / `A1:J{last}`) — dropdown filter tiap kolom.
- **Horizontal centered** saat dicetak.
- `<dimension ref="A1:...">` ditambahkan.
Urutan elemen mengikuti skema OOXML: sheetPr+dimension+sheetViews+sheetFormatPr sebelum cols; autoFilter sebelum mergeCells; printOptions+pageMargins+pageSetup setelah mergeCells.

### Ganti pengabsen pembayaran jadi "ellerick"
- Update D1 `pay`: `UPDATE pay SET data = json_set(data, '$.penerima', 'ellerick')` — 139 baris, rows_written 139.
- Sebelum: penerima = "Ellerick Darren Lestyono" (101) + "Petugas LIS" (38). Sesudah: semua "ellerick".
- Backup `pay` disimpan di `qa/pay_backup.json` (139 baris).
- Berlaku untuk kolom Penerima di rekap pembayaran XLSX dan tampilan Tagihan.

### Verifikasi produksi v72 (headless Edge, rentang 2026-11-01 s/d 2026-11-18)
- Rekap log: paperSize 9, margin 0.25, fitToWidth 1, freeze header, autoFilter, horizontalCentered, dimension A1:K142.
- Rekap pembayaran: sama (A1:J91). Kolom Penerima: 73 sel "ellerick", tidak ada "Petugas LIS" atau "Ellerick Darren" tersisa.

Commit: (lihat git log). Produksi https://mutajawwiz.pages.dev = v72.


## v73 — Tombol Info Log per orang di menu Tagihan (popup)

Setiap baris tagihan di halaman Tagihan (menu 3) sekarang punya tombol **Info** di kolom aksi. Klik → popup nunjukin rincian log pelanggaran orang itu.

### Modal `#loginfo-modal` (index.html)
- Modal popup biru langit (`#B6D9FC`), max-w-lg, scrollable (max-h 85vh), sticky header.
- `#loginfo-summary`: nama + stambuk, kelas, kamar, rayon, tanggal pelanggaran, total denda, status (Lunas/Belum/Hidden).
- `#loginfo-body`: satu kartu per log di balik tagihan itu (kalau digabung >1 log, muncul semua).
- Tiap kartu log: label `Log N / total`, badge Lunas/Belum, **Pengabsen**, **Tanggal + Waktu**, **Bahasa**, **Ucapan/Keterangan**, **Kamar + Kelas**, dan kalau lunas: tanggal dilunasi + penerima.
- Tutup via tombol ✕, tombol Tutup, ESC, atau klik backdrop.

### Fungsi `js/spa.js`
- `openLogInfo(key)`: cari bill via `getConsolidatedTagihan()`, render summary + `bill.logs` ke modal, tampilkan.
- `closeLogInfo()`: sembunyikan modal.
- Tombol `Info` ditambah di kolom aksi tiap `<tr>` tagihan (selalu ada, lunas/belum/hidden).
- ESC listener + backdrop click close didaftarkan di init.

### Verifikasi produksi v73 (headless Edge)
- 173 tombol Info muncul di halaman Tagihan.
- Klik tombol pertama → modal muncul, summary: "Fawwazurrasyad Abdullah Anna'Iim (24807) • II C • Ampel (2) Kamar 3 • 2026-11-22 • Rp 2.000 • Belum Lunas".
- Kartu log: "Log 1/1 • Belum • Pengabsen: Zain Zuhda Taqihaq • Tanggal 2026-11-22 Waktu 06:59:20 • Bahasa Indonesian • Ucapan/Ket: - • Kamar Ampel (2) Kamar 3 • Kelas II C".
- ESC menutup modal.

Commit: (lihat git log). Produksi https://mutajawwiz.pages.dev = v73.
