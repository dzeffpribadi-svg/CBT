-- =====================================================================
-- CBT Ulangan Harian Siswa - Cloudflare D1 Schema
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- USERS (akun login: admin, guru, siswa)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- format: pbkdf2$iterasi$salt_hex$hash_hex
  role          TEXT NOT NULL CHECK (role IN ('admin','guru','siswa')),
  nama_lengkap  TEXT NOT NULL,
  aktif         INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ---------------------------------------------------------------------
-- KELAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kelas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_kelas  TEXT NOT NULL UNIQUE,      -- contoh: 7A, 8B, 9C
  tingkat     INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- MAPEL (mata pelajaran)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mapel (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_mapel  TEXT NOT NULL,
  kode_mapel  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- SISWA (profil tambahan untuk user berrole 'siswa')
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS siswa_profil (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nis         TEXT NOT NULL UNIQUE,
  kelas_id    INTEGER NOT NULL REFERENCES kelas(id) ON DELETE RESTRICT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_siswa_kelas ON siswa_profil(kelas_id);

-- ---------------------------------------------------------------------
-- GURU (profil tambahan untuk user berrole 'guru')
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guru_profil (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nip         TEXT UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Guru <-> Mapel yang diampu (many-to-many)
CREATE TABLE IF NOT EXISTS guru_mapel (
  guru_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mapel_id    INTEGER NOT NULL REFERENCES mapel(id) ON DELETE CASCADE,
  PRIMARY KEY (guru_id, mapel_id)
);

-- ---------------------------------------------------------------------
-- BANK SOAL
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_soal (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mapel_id       INTEGER NOT NULL REFERENCES mapel(id) ON DELETE RESTRICT,
  guru_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tipe_soal      TEXT NOT NULL CHECK (tipe_soal IN ('pilihan_ganda','benar_salah','isian')),
  pertanyaan     TEXT NOT NULL,
  gambar_url     TEXT,                  -- url gambar soal (opsional)
  bobot_nilai    REAL NOT NULL DEFAULT 1,
  kunci_jawaban  TEXT,                  -- untuk 'benar_salah' ('benar'/'salah') & 'isian' (teks jawaban)
  level_kesulitan TEXT DEFAULT 'sedang' CHECK (level_kesulitan IN ('mudah','sedang','sulit')),
  aktif          INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_soal_mapel ON bank_soal(mapel_id);
CREATE INDEX IF NOT EXISTS idx_soal_guru ON bank_soal(guru_id);
CREATE INDEX IF NOT EXISTS idx_soal_tipe ON bank_soal(tipe_soal);

-- Opsi jawaban untuk soal tipe pilihan_ganda
CREATE TABLE IF NOT EXISTS opsi_jawaban (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  soal_id    INTEGER NOT NULL REFERENCES bank_soal(id) ON DELETE CASCADE,
  teks_opsi  TEXT NOT NULL,
  is_benar   INTEGER NOT NULL DEFAULT 0 CHECK (is_benar IN (0,1)),
  urutan     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_opsi_soal ON opsi_jawaban(soal_id);

-- ---------------------------------------------------------------------
-- ULANGAN (ujian)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ulangan (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  judul           TEXT NOT NULL,
  deskripsi       TEXT,
  mapel_id        INTEGER NOT NULL REFERENCES mapel(id) ON DELETE RESTRICT,
  kelas_id        INTEGER NOT NULL REFERENCES kelas(id) ON DELETE RESTRICT,
  guru_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  durasi_menit    INTEGER NOT NULL CHECK (durasi_menit > 0),
  jumlah_soal     INTEGER NOT NULL CHECK (jumlah_soal > 0),
  acak_soal       INTEGER NOT NULL DEFAULT 1 CHECK (acak_soal IN (0,1)),
  acak_jawaban    INTEGER NOT NULL DEFAULT 1 CHECK (acak_jawaban IN (0,1)),
  waktu_mulai     TEXT NOT NULL,          -- jadwal buka (ISO datetime UTC)
  waktu_selesai   TEXT NOT NULL,          -- jadwal tutup (ISO datetime UTC)
  passing_grade   REAL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (waktu_selesai > waktu_mulai)
);
CREATE INDEX IF NOT EXISTS idx_ulangan_kelas ON ulangan(kelas_id);
CREATE INDEX IF NOT EXISTS idx_ulangan_guru ON ulangan(guru_id);
CREATE INDEX IF NOT EXISTS idx_ulangan_mapel ON ulangan(mapel_id);
CREATE INDEX IF NOT EXISTS idx_ulangan_status ON ulangan(status);

-- Bank soal yang dimasukkan ke kumpulan soal ulangan (pool, sebelum diacak/dipilih per siswa)
CREATE TABLE IF NOT EXISTS ulangan_soal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ulangan_id  INTEGER NOT NULL REFERENCES ulangan(id) ON DELETE CASCADE,
  soal_id     INTEGER NOT NULL REFERENCES bank_soal(id) ON DELETE RESTRICT,
  urutan      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ulangan_id, soal_id)
);
CREATE INDEX IF NOT EXISTS idx_ulsoal_ulangan ON ulangan_soal(ulangan_id);

-- ---------------------------------------------------------------------
-- ATTEMPT (percobaan pengerjaan siswa) - SATU KALI per (ulangan, siswa)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ulangan_attempt (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  ulangan_id            INTEGER NOT NULL REFERENCES ulangan(id) ON DELETE CASCADE,
  siswa_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_sesi            TEXT NOT NULL UNIQUE,
  urutan_soal_json       TEXT NOT NULL,     -- JSON array soal_id, urutan final (sudah diacak) untuk attempt ini
  waktu_mulai           TEXT NOT NULL,
  waktu_batas           TEXT NOT NULL,      -- waktu_mulai + durasi_menit, dihitung server
  waktu_submit          TEXT,
  status                TEXT NOT NULL DEFAULT 'berlangsung' CHECK (status IN ('berlangsung','selesai','timeout')),
  nilai                 REAL,
  jumlah_benar          INTEGER,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ulangan_id, siswa_id)
);
CREATE INDEX IF NOT EXISTS idx_attempt_siswa ON ulangan_attempt(siswa_id);
CREATE INDEX IF NOT EXISTS idx_attempt_ulangan ON ulangan_attempt(ulangan_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempt_token ON ulangan_attempt(token_sesi);

-- Jawaban siswa per soal dalam sebuah attempt (autosave)
CREATE TABLE IF NOT EXISTS jawaban_attempt (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id   INTEGER NOT NULL REFERENCES ulangan_attempt(id) ON DELETE CASCADE,
  soal_id      INTEGER NOT NULL REFERENCES bank_soal(id) ON DELETE RESTRICT,
  opsi_id      INTEGER REFERENCES opsi_jawaban(id) ON DELETE SET NULL,  -- untuk pilihan_ganda
  jawaban_teks TEXT,                        -- untuk isian / benar_salah ('benar'/'salah')
  ditandai     INTEGER NOT NULL DEFAULT 0 CHECK (ditandai IN (0,1)),   -- ragu-ragu
  is_benar     INTEGER CHECK (is_benar IN (0,1)),    -- diisi saat grading
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (attempt_id, soal_id)
);
CREATE INDEX IF NOT EXISTS idx_jawaban_attempt ON jawaban_attempt(attempt_id);

-- ---------------------------------------------------------------------
-- Seed data awal: 1 akun admin default (password: Admin#12345 -> diganti setelah setup)
-- Hash di bawah adalah placeholder yang HARUS diganti melalui endpoint setup awal
-- (lihat README bagian "Setup Akun Admin Pertama") - baris ini sengaja TIDAK
-- memasukkan admin agar tidak ada kredensial default yang tertanam di source.
-- ---------------------------------------------------------------------
