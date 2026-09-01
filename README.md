# CBT Ulangan Harian Siswa

Aplikasi Computer Based Test (CBT) untuk ulangan harian siswa. PWA installable
(Android), dibangun dengan **HTML/CSS/JavaScript vanilla** di sisi frontend dan
**Cloudflare Workers + D1 (+ R2 untuk gambar soal)** di sisi backend. Tidak ada
framework/dependency runtime — cocok untuk dideploy langsung dari sebuah
repository GitHub privat yang terhubung ke Cloudflare Workers (Workers Builds).

## Fitur

- Login role-based: **Admin**, **Guru**, **Siswa** (password di-hash PBKDF2-SHA256, sesi via JWT HS256)
- Guru/Admin: kelola kelas, mapel, akun siswa & guru, bank soal (pilihan ganda/benar-salah/isian + gambar), buat & atur ulangan (durasi, jadwal, jumlah soal, acak soal & jawaban), publikasikan, rekap nilai
- **Pembatasan guru per mapel**: admin menugaskan mapel yang boleh diampu tiap guru (menu Guru → "Atur Mapel"). Guru hanya bisa membuat/mengedit soal & ulangan untuk mapel yang ditugaskan; dropdown mapel di form soal/ulangan otomatis hanya menampilkan mapel yang diampu, dan API menolak (403) permintaan di luar penugasan tersebut. Admin tidak dibatasi.
- Siswa: lihat ulangan sesuai kelas, mulai ujian (timer dihitung & divalidasi **di server**, bukan di klien), navigasi & tandai ragu-ragu soal, autosave jawaban, submit otomatis saat waktu habis, nilai otomatis
- **Satu kali percobaan** per ulangan (constraint `UNIQUE(ulangan_id, siswa_id)` di database + validasi API)
- Autosave jawaban tetap aman saat koneksi terputus: jawaban disimpan ke **IndexedDB** lokal lalu disinkronkan otomatis begitu koneksi kembali
- PWA installable (manifest + service worker, app-shell caching, `/api/*` selalu network-only agar data ujian selalu real-time & aman)
- Database D1 relasional lengkap dengan foreign key, index, dan constraint (lihat `schema.sql`)

## Arsitektur

```
Browser (PWA, vanilla JS, hash router)
        │  fetch() same-origin atau cross-origin (CORS)
        ▼
Cloudflare Worker (worker/src/index.js — router manual, tanpa framework)
        │
        ├── D1 Database "DB"        → data relasional (users, soal, ulangan, jawaban, dst.)
        └── R2 Bucket   "IMAGES"    → gambar soal (opsional, untuk tipe soal bergambar)
```

Worker sekaligus menyajikan frontend statis (folder `public/`) lewat fitur
**Workers Static Assets**, jadi satu Worker = satu deployment untuk API + UI.
Jika Anda ingin memisah hosting frontend (GitHub Pages/Cloudflare Pages) dari
Worker API, ubah `public/js/shared/config.js` → isi `API_BASE_URL` dengan URL
Worker Anda; CORS sudah diaktifkan di Worker.

### Struktur folder

```
cbt-app/
├── wrangler.toml            # konfigurasi deploy Worker + D1 + R2 + assets
├── schema.sql                # skema database D1
├── package.json
├── worker/src/
│   ├── index.js               # router utama + error handling + CORS + rate limit
│   ├── lib/
│   │   ├── crypto.js          # PBKDF2 hashing & JWT HS256 (Web Crypto, tanpa dependency)
│   │   └── http.js            # helper response JSON, ApiError
│   ├── middleware/auth.js     # verifikasi JWT + role-based access
│   └── routes/
│       ├── auth.js            # login, setup admin pertama, ganti password
│       ├── kelas.js, mapel.js # CRUD master data
│       ├── users.js           # CRUD akun guru & siswa
│       ├── soal.js            # CRUD bank soal + opsi jawaban
│       ├── ulangan.js         # CRUD ulangan, atur pool soal, publish, rekap nilai
│       ├── ujian.js           # flow ujian siswa: mulai, timer server, autosave, submit + auto-grading
│       ├── nilai.js           # riwayat nilai siswa
│       └── upload.js          # upload & sajikan gambar soal via R2
└── public/                    # PWA frontend (vanilla JS, ES modules)
    ├── index.html, manifest.json, sw.js
    ├── css/style.css
    └── js/
        ├── app.js              # entry point, routing, auth guard
        ├── shared/             # api client, store sesi, router, UI helper, antrean offline
        ├── teacher/            # halaman guru/admin
        └── student/            # halaman siswa (termasuk flow pengerjaan ujian)
```

## Alur keamanan & integritas ujian

1. **Timer di server.** Saat siswa menekan "Mulai Ujian", server menghitung
   `waktu_batas = sekarang + durasi_menit` (dibatasi agar tidak melewati jadwal
   tutup ulangan) dan menyimpannya di tabel `ulangan_attempt`. Klien hanya
   menampilkan hitung mundur; setiap permintaan (`/status`, `/jawab`, `/submit`)
   divalidasi ulang terhadap `waktu_batas` di server. Jika sudah lewat, attempt
   otomatis diselesaikan berstatus `timeout` dan jawaban tidak bisa diubah lagi.
2. **Satu kali percobaan.** Kombinasi `(ulangan_id, siswa_id)` bersifat `UNIQUE`
   di database, ditambah pengecekan di endpoint `mulai` — jika attempt sudah
   `selesai`/`timeout`, permintaan mulai ulang ditolak (409).
2. **Soal & opsi diacak per siswa** dan urutannya (termasuk urutan opsi pilihan
   ganda) disimpan sebagai snapshot di kolom `urutan_soal_json` pada attempt,
   sehingga urutan konsisten setiap kali siswa membuka kembali sesi yang sama.
3. **Kunci jawaban tidak pernah dikirim ke klien** selama ujian berlangsung —
   endpoint `/attempt/:token/soal` hanya mengirim teks opsi, bukan `is_benar`.
4. **Password** disimpan sebagai `pbkdf2$iterasi$salt$hash` (100.000 iterasi,
   SHA-256, salt acak per user, perbandingan tahan timing-attack).
5. **Autentikasi** memakai JWT (HS256) yang ditandatangani dengan secret rahasia
   (`JWT_SECRET`, disimpan sebagai Wrangler secret, **tidak pernah** ditulis di
   source code) dan divalidasi ulang terhadap status akun aktif di database
   pada setiap permintaan.
6. **Role-based access control** di setiap route (`admin`, `guru`, `siswa`);
   guru hanya bisa mengelola soal/ulangan miliknya sendiri (admin bisa semua).
   Guru juga dibatasi hanya boleh membuat/mengedit soal & ulangan untuk **mapel
   yang ditugaskan admin** (tabel `guru_mapel`, endpoint `PUT /guru/:id/mapel`);
   ini divalidasi di server (`assertMapelDiampu`), bukan hanya di UI.
7. Rate limiting sederhana per-IP di level Worker untuk mitigasi brute force.

## Prasyarat

- Akun Cloudflare (Workers + D1 + R2 aktif — semuanya tersedia di paket gratis)
- Node.js 18+ dan npm terpasang di komputer Anda / CI
- Wrangler CLI (`npm install` di root proyek akan memasangnya sebagai devDependency)

## Setup & Deployment

### 1. Install dependency

```bash
npm install
```

### 2. Login ke Cloudflare

```bash
npx wrangler login
```

### 3. Buat database D1

```bash
npx wrangler d1 create cbt-ulangan-db
```

Perintah di atas akan menampilkan `database_id`. Salin nilai tersebut ke
`wrangler.toml`, ganti baris:

```toml
database_id = "GANTI_DENGAN_DATABASE_ID_ANDA"
```

### 4. Buat bucket R2 (untuk gambar soal)

```bash
npx wrangler r2 bucket create cbt-soal-images
```

Jika Anda tidak membutuhkan fitur upload gambar soal, langkah ini boleh
dilewati — aplikasi tetap berjalan normal, hanya endpoint `/api/upload` yang
akan menolak permintaan dengan pesan bucket belum dikonfigurasi.

### 5. Jalankan migrasi schema

Lokal (untuk development dengan `wrangler dev`):

```bash
npm run db:migrate:local
```

Production (database D1 yang sesungguhnya):

```bash
npm run db:migrate:remote
```

### 6. Set secret JWT

**Wajib** — Worker tidak akan berjalan tanpa ini. Gunakan string acak yang
panjang (minimal 32 karakter, simpan baik-baik, jangan dibagikan):

```bash
npx wrangler secret put JWT_SECRET
```

### 7. Deploy

```bash
npm run deploy
```

Wrangler akan menampilkan URL Worker Anda, contoh:
`https://cbt-ulangan-harian.<subdomain-anda>.workers.dev`

### 8. Buat akun Admin pertama

Endpoint ini **hanya bisa dipanggil sekali** (otomatis terkunci setelah admin
pertama berhasil dibuat). Jalankan dari terminal (ganti URL & data Anda):

```bash
curl -X POST https://cbt-ulangan-harian.<subdomain-anda>.workers.dev/api/auth/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"PasswordKuatAnda123","nama_lengkap":"Administrator"}'
```

Setelah itu, login melalui aplikasi web menggunakan akun admin tersebut, lalu
buat akun guru & siswa melalui menu **Guru** dan **Siswa**.

## Development lokal

```bash
npm run dev
```

Wrangler akan menjalankan Worker + D1 lokal (SQLite) + menyajikan `public/` di
`http://localhost:8787`. Jalankan `npm run db:migrate:local` terlebih dahulu
agar schema tersedia di database lokal.

## Deploy otomatis dari GitHub (repo privat) — Workers Builds

Karena Anda hosting di GitHub privat dan ingin Worker terhubung otomatis:

1. Push seluruh isi folder proyek ini ke repository GitHub privat Anda.
2. Di Cloudflare Dashboard → **Workers & Pages** → **Create** → **Connect to Git**,
   pilih repository privat Anda (Cloudflare akan meminta izin GitHub App —
   cukup berikan akses ke repo tersebut, tidak perlu akses ke seluruh akun).
3. Set **Build command**: `npm install` (tidak perlu build step lain, karena
   frontend vanilla JS tidak memerlukan bundler).
4. Set **Deploy command**: `npx wrangler deploy`.
5. Di tab **Settings → Variables and Secrets** pada project Worker tersebut,
   tambahkan secret `JWT_SECRET` (nilai acak, sama seperti langkah 6 di atas).
6. Pastikan binding D1 (`DB`) dan R2 (`IMAGES`) sudah sesuai `wrangler.toml` —
   Cloudflare akan otomatis mendeteksinya dari file konfigurasi saat build.
7. Setiap kali Anda push ke branch produksi (default `main`), Cloudflare akan
   otomatis build & deploy Worker terbaru.

> Karena repo bersifat privat, tidak ada langkah tambahan yang diperlukan —
> Cloudflare Workers Builds mendukung repository privat selama GitHub App
> Cloudflare diberi akses ke repo tersebut pada langkah 2.

## Skema Database (ringkas)

| Tabel               | Keterangan |
|---------------------|------------|
| `users`              | Akun login (admin/guru/siswa), password ter-hash |
| `kelas`              | Master data kelas |
| `mapel`               | Master data mata pelajaran |
| `siswa_profil`        | Profil tambahan siswa (NIS, kelas) — 1:1 dengan `users` |
| `guru_profil`, `guru_mapel` | Profil tambahan guru & penugasan mapel yang diampu (menentukan mapel apa saja yang boleh dikelola guru tsb) |
| `bank_soal`           | Bank soal (pilihan ganda/benar-salah/isian, bobot, gambar) |
| `opsi_jawaban`        | Opsi jawaban untuk soal pilihan ganda |
| `ulangan`             | Ujian: durasi, jadwal, jumlah soal, pengacakan, status |
| `ulangan_soal`        | Pool soal yang tersedia untuk sebuah ulangan |
| `ulangan_attempt`     | Satu baris = satu percobaan siswa (unik per ulangan+siswa), menyimpan `token_sesi`, `waktu_batas`, snapshot urutan soal, nilai |
| `jawaban_attempt`     | Jawaban per soal per attempt (autosave), termasuk flag ragu-ragu & hasil koreksi |

Lihat `schema.sql` untuk definisi lengkap (index & constraint).

## Ringkasan Endpoint API

Semua endpoint berprefix `/api`. Endpoint selain `/auth/login`,
`/auth/setup-admin` memerlukan header `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Keterangan |
|---|---|---|---|
| POST | `/auth/setup-admin` | publik (sekali saja) | Buat admin pertama |
| POST | `/auth/login` | publik | Login |
| GET | `/auth/me` | semua | Profil user login |
| POST | `/auth/change-password` | semua | Ganti password |
| GET/POST/PUT/DELETE | `/kelas`, `/mapel` | admin, guru | CRUD master data |
| GET/POST/PUT/DELETE | `/siswa`, `/guru` | admin (guru terbatas) | CRUD akun |
| GET | `/guru/:id/mapel` (atau `/guru/saya/mapel`) | admin, atau guru untuk dirinya sendiri | Lihat penugasan mapel |
| PUT | `/guru/:id/mapel` | admin | Ubah penugasan mapel guru |
| GET/POST/PUT/DELETE | `/soal` | admin, guru | CRUD bank soal |
| POST | `/upload` | admin, guru | Upload gambar soal ke R2 |
| GET/POST/PUT/DELETE | `/ulangan` | admin, guru | CRUD ulangan |
| PUT | `/ulangan/:id/soal` | admin, guru | Atur pool soal ulangan |
| POST | `/ulangan/:id/publish` \| `/close` | admin, guru | Ubah status ulangan |
| GET | `/ulangan/:id/rekap` | admin, guru | Rekap nilai sekelas |
| GET | `/siswa/ulangan` | siswa | Daftar ulangan untuk kelasnya |
| POST | `/siswa/ulangan/:id/mulai` | siswa | Mulai/resume attempt |
| GET | `/siswa/attempt/:token/soal` | siswa | Ambil soal (tersanitasi) + jawaban tersimpan |
| GET | `/siswa/attempt/:token/status` | siswa | Polling sisa waktu server |
| POST | `/siswa/attempt/:token/jawab` | siswa | Autosave jawaban |
| POST | `/siswa/attempt/:token/submit` | siswa | Selesaikan & hitung nilai |
| GET | `/siswa/nilai` | siswa | Riwayat nilai |

## Catatan & batasan yang perlu diketahui

- Penilaian otomatis untuk soal **isian** menggunakan pencocokan teks persis
  (case-insensitive, trim whitespace). Untuk soal isian dengan banyak variasi
  jawaban benar, pertimbangkan memecahnya menjadi soal pilihan ganda/benar-salah,
  atau lakukan koreksi manual lewat endpoint `GET /ulangan/:id/attempt/:attemptId`
  (data lengkap jawaban tersedia di sana untuk ditinjau guru).
- Rate limiting bersifat in-memory per isolate Worker (reset saat isolate baru
  dibuat) — cukup untuk mitigasi brute force ringan, bukan pengganti Cloudflare
  WAF/Turnstile untuk skala besar.
- Ikon PWA disediakan sebagai contoh sederhana di `public/icons/` — ganti
  dengan logo sekolah Anda (ukuran sama: 192×192 & 512×512, termasuk varian maskable).
