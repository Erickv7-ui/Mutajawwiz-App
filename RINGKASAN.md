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

### Pemakaian per aksi (setelah optimasi v35)

| Aksi | Simple ops | Advanced ops |
|------|-----------|--------------|
| Buka halaman (bootstrap) | 4 get (master, lis, logs, pay) | 0 |
| Simpan 5 absensi (batch) | 1 get + 1 put | 0 |
| Input massal 30 anggota | 1 get + 1 put | 0 |
| Tandai lunas 1 tagihan | 1 get + 1 put | 0 |
| Lunas masal 10 tagihan | 1 get + 1 put | 0 |
| Hapus semua data | 2 put | 0 (skip list kalau sudah migrasi) |
| Migrasi awal (sekali seumur app) | beberapa get | 1–2 list |

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

| Komponen | Simple ops/bulan |
|----------|------------------|
| Bootstrap | 6.000 |
| Simpan (batch 5) | 3.600 |
| Pembayaran | 1.800 |
| **Total** | **≈ 11.400 → LEWAT** |

### Status sekarang (14 Nov 2026)

- Log absensi: 0 (baru dibersihkan)
- Anggota: 724 · LIS: 28
- Ukuran blob: `db/logs.json` ≈ 0 KB, master 168 KB, lis 6 KB
- Estimasi pemakaian: < 5% dari limit Hobby

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
| Data balik setelah hapus | Cache lokal lama | Klik "Bersihkan Cache", hard refresh Ctrl+Shift+R |
| Tagihan naik sendiri | Log duplikat lama | Admin → `dedupe_logs`, atau hapus semua data |
| PIN selalu salah | PIN lokal diganti, beda dari server | Isi Server Pass `LIS26-27` di Pengaturan; lunasi/ekspor/CRUD normalnya cukup PIN `2627` |
| Web lambat | Cache browser penuh / blob besar | Bersihkan cache, cek jumlah log |
| Autofill pengabsen kosong | Daftar LIS belum termuat | Tunggu bootstrap, atau cek panel Database LIS |
| Tombol tidak bisa diklik | Overlay gate masih tampil | Hard refresh; gate butuh login dulu |

---

## 8. Struktur File

```
index.html              # shell SPA + modal + gate login
css/app.css             # layout utama + responsive
css/theme.css           # dark/light
css/style.css           # komponen neo-brutalisme
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
