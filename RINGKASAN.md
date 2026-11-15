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
  Tombol Reset Filter ikut mengosongkannya.
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

