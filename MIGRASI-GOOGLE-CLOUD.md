# Migrasi penuh: Vercel -> Google Cloud

Tujuan: web absensi tidak lagi bergantung ke Vercel.
- Database: **Cloud Firestore** (ganti Vercel Blob) — `lib/firestore.js`
- API + logika: **Cloud Run** (`server.js`, `Dockerfile`)
- File statis + domain: **Firebase Hosting** (rewrite `/api/**` ke Cloud Run)

Kode di repo sudah siap. Yang tersisa hanya langkah akun/console, karena butuh login Google kamu.

---

## 1. Siapkan project (console, sekali saja)

1. https://console.cloud.google.com -> **New Project**, nama misal `mutajawwiz`.
2. **Billing** -> link billing account. (Firestore + Cloud Run wajib billing aktif; kuota gratis tetap berlaku.)
3. **Firestore** -> Create database -> **Native mode** -> location `asia-southeast2` (Jakarta).
4. Aktifkan API (Cloud Shell / gcloud):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com firestore.googleapis.com \
  firebasehosting.googleapis.com
```

5. Izin Firestore untuk service account Cloud Run (default: `<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`):

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

Di Cloud Run **tidak perlu file kunci JSON**: `lib/firestore.js` otomatis pakai
Application Default Credentials dari metadata server (terdeteksi lewat env `K_SERVICE`).

---

## 2. Deploy API ke Cloud Run

Dari root repo (butuh gcloud CLI + sudah `gcloud auth login`):

```bash
gcloud run deploy mutajawwiz-api \
  --source . \
  --region asia-southeast2 \
  --allow-unauthenticated \
  --memory 512Mi \
  --set-env-vars DB_DRIVER=firestore,GOOGLE_PROJECT_ID=PROJECT_ID,TZ=Asia/Jakarta
```

Password admin jangan di `--set-env-vars` (kelihatan di deskripsi service). Pakai Secret Manager:

```bash
printf '%s' 'ISI_PASSWORD' | gcloud secrets create ADMIN_PASSWORD --data-file=-
printf '%s' 'ISI_PIN'      | gcloud secrets create ADMIN_PIN --data-file=-

gcloud run services update mutajawwiz-api --region asia-southeast2 \
  --update-secrets ADMIN_PASSWORD=ADMIN_PASSWORD:latest,ADMIN_PIN=ADMIN_PIN:latest
```

Alternatif tanpa gcloud lokal: console -> **Cloud Run** -> **Deploy from repository** ->
pilih repo GitHub `Mutajawwiz-App` -> branch `main` -> build type **Dockerfile** -> region `asia-southeast2`.
Set env yang sama di tab *Variables & Secrets*.

Cek: `https://<url-run-app>/api?action=ping` harus balikin
`{"ok":true,"driver":"firestore","dbReady":true,...}`.

---

## 3. Pindahkan SEMUA data lama (sekali jalan, aman diulang)

Masih dengan `DB_DRIVER` **belum** `firestore` (atau boleh juga, karena aksi ini membaca Blob langsung):

```bash
node -e "fetch('https://<url>/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'migrate_firestore',password:'SERVER_PASS'})}).then(r=>r.json()).then(j=>console.log(j))"
```

Balikan contoh:

```json
{"ok":true,"logs":121,"pay":98,"anggota":724,"lis":31,"fsCount":121,"verified":true}
```

`verified: true` artinya jumlah dokumen di Firestore sama dengan jumlah entri di Blob.
Kalau `false`, jangan matikan Blob — ulangi aksi ini (idempoten, `replaceAll`).

Isi yang dipindah:
- `logs` (semua absensi) -> collection `logs`, 1 dokumen per `id_log`
- status bayar / hidden -> collection `pay`, id `${tgl}__${stambuk}`
- master anggota + database LIS -> collection `meta`, dokumen `anggota` dan `lis`

---

## 4. Firebase Hosting + domain

```bash
npx firebase-tools login          # sekali, buka browser
npx firebase-tools use PROJECT_ID
npm run build:static              # bikin dist/
npx firebase-tools deploy --only hosting
```

`firebase.json` sudah mengarahkan `/api` dan `/api/**` ke Cloud Run `mutajawwiz-api` region `asia-southeast2`.
Ganti `GANTI-PROJECT-ID` di `.firebaserc` dengan project id asli.

Domain `experimentlynss.my.id` (dikelola di cloudhost.id):
1. Firebase console -> Hosting -> **Add custom domain** -> `experimentlynss.my.id` (+ `www`).
2. Firebase kasih record: `A` (2 alamat IP) untuk apex, `TXT` verifikasi, `CNAME` untuk `www`.
3. Masukkan record itu di panel cloudhost.id. Propagasi DNS 5-60 menit, SSL terbit otomatis.

---

## 5. Verifikasi setelah pindah

1. `GET /api?action=ping` -> `driver: firestore`, `version: v50`.
2. `GET /api?action=logs` -> `count` sama dengan sebelum migrasi (121).
3. Input absensi baru di web -> muncul di Firestore (console -> Firestore -> collection `logs`).
4. Buka Tagihan -> tandai lunas -> refresh -> status tetap.
5. Export XLSX jalan, urutan kelas tetap.

---

## 6. Rollback (kalau ada masalah)

- Blob **tidak dihapus** selama migrasi. Balikin `DB_DRIVER=blob` (atau hapus env itu) ->
  web langsung kembali memakai Blob + snapshot lama.
- Domain: kembalikan record DNS ke Vercel, atau tetap di Firebase Hosting tapi
  rewrite `/api/**` diarahkan ke deployment Vercel lama.
- Data yang masuk saat mode Firestore tidak otomatis balik ke Blob; kalau perlu,
  ekspor dari Firestore (`action=export`) lalu impor.

---

## 7. Setelah yakin (baru hapus Vercel)

- Hapus `vercel.json`, dependency `@vercel/blob`, dan kode jalur Blob di `api/index.js`
  (semua bercabang lewat `useFS`, jadi gampang dicabut).
- Hapus project Vercel + Blob store supaya tidak ada tagihan/quota yang kepakai.
- Simpan `GOOGLE_SA_JSON` hanya kalau masih mau jalan di luar Google Cloud (Render/VPS).
