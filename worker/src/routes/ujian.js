import { ok, created, ApiError, parseJSON } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { randomToken } from '../lib/crypto.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getSiswaKelas(env, userId) {
  const row = await env.DB.prepare('SELECT kelas_id FROM siswa_profil WHERE user_id = ?').bind(userId).first();
  if (!row) throw new ApiError('Profil siswa tidak ditemukan', 404);
  return row.kelas_id;
}

/** GET /api/siswa/ulangan - daftar ulangan untuk kelas siswa beserta status pengerjaan */
export async function listUlanganSiswa(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['siswa']);
  const kelasId = await getSiswaKelas(env, user.id);

  const { results } = await env.DB.prepare(
    `SELECT ul.id, ul.judul, ul.deskripsi, ul.durasi_menit, ul.jumlah_soal, ul.waktu_mulai, ul.waktu_selesai,
            m.nama_mapel, a.id as attempt_id, a.status as attempt_status, a.nilai
     FROM ulangan ul
     JOIN mapel m ON m.id = ul.mapel_id
     LEFT JOIN ulangan_attempt a ON a.ulangan_id = ul.id AND a.siswa_id = ?
     WHERE ul.kelas_id = ? AND ul.status = 'published'
     ORDER BY ul.waktu_mulai DESC`
  )
    .bind(user.id, kelasId)
    .all();

  const now = new Date();
  const data = results.map((r) => {
    let statusTampil;
    if (r.attempt_status === 'selesai' || r.attempt_status === 'timeout') statusTampil = 'sudah_selesai';
    else if (r.attempt_status === 'berlangsung') statusTampil = 'sedang_berlangsung';
    else if (now < new Date(r.waktu_mulai)) statusTampil = 'belum_dibuka';
    else if (now > new Date(r.waktu_selesai)) statusTampil = 'sudah_ditutup';
    else statusTampil = 'bisa_dikerjakan';
    return { ...r, status_tampil: statusTampil };
  });
  return ok(data, origin);
}

/** POST /api/siswa/ulangan/:id/mulai - mulai attempt baru (atau resume jika masih berlangsung) */
export async function mulaiUlangan(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['siswa']);
  const kelasId = await getSiswaKelas(env, user.id);

  const ul = await env.DB.prepare('SELECT * FROM ulangan WHERE id = ?').bind(params.id).first();
  if (!ul) throw new ApiError('Ulangan tidak ditemukan', 404);
  if (ul.status !== 'published') throw new ApiError('Ulangan belum/tidak tersedia', 403);
  if (ul.kelas_id !== kelasId) throw new ApiError('Ulangan ini bukan untuk kelas Anda', 403);

  const now = new Date();
  if (now < new Date(ul.waktu_mulai)) throw new ApiError('Ulangan belum dibuka', 403);
  if (now > new Date(ul.waktu_selesai)) throw new ApiError('Ulangan sudah ditutup', 403);

  const existing = await env.DB.prepare('SELECT * FROM ulangan_attempt WHERE ulangan_id = ? AND siswa_id = ?')
    .bind(params.id, user.id)
    .first();

  if (existing) {
    if (existing.status !== 'berlangsung') {
      throw new ApiError('Anda sudah pernah mengerjakan ulangan ini (satu kali percobaan)', 409);
    }
    // resume attempt yang masih berjalan
    return ok(
      { token_sesi: existing.token_sesi, waktu_batas: existing.waktu_batas, resume: true },
      origin
    );
  }

  // Ambil pool soal, pilih acak sejumlah jumlah_soal, urutkan sesuai pengaturan
  const { results: pool } = await env.DB.prepare(
    'SELECT soal_id FROM ulangan_soal WHERE ulangan_id = ? ORDER BY urutan'
  )
    .bind(params.id)
    .all();
  if (pool.length < ul.jumlah_soal) {
    throw new ApiError('Konfigurasi soal ulangan tidak lengkap, hubungi guru', 500);
  }
  let selected = shuffle(pool.map((p) => p.soal_id)).slice(0, ul.jumlah_soal);
  if (!ul.acak_soal) {
    // kembalikan ke urutan asli pool untuk soal yang terpilih
    const poolOrder = pool.map((p) => p.soal_id);
    selected = poolOrder.filter((id) => selected.includes(id));
  }

  // Untuk tiap soal pilihan_ganda, siapkan urutan opsi (acak jika acak_jawaban true)
  const attemptSoal = [];
  for (const soalId of selected) {
    const soal = await env.DB.prepare('SELECT id, tipe_soal FROM bank_soal WHERE id = ?').bind(soalId).first();
    let opsiIds = [];
    if (soal.tipe_soal === 'pilihan_ganda') {
      const { results: opsi } = await env.DB.prepare('SELECT id FROM opsi_jawaban WHERE soal_id = ? ORDER BY urutan')
        .bind(soalId)
        .all();
      opsiIds = opsi.map((o) => o.id);
      if (ul.acak_jawaban) opsiIds = shuffle(opsiIds);
    }
    attemptSoal.push({ soal_id: soalId, opsi_ids: opsiIds });
  }

  const durasiMs = ul.durasi_menit * 60 * 1000;
  let waktuBatas = new Date(now.getTime() + durasiMs);
  const batasJadwal = new Date(ul.waktu_selesai);
  if (waktuBatas > batasJadwal) waktuBatas = batasJadwal; // tidak boleh melewati jadwal tutup ulangan

  const token = randomToken();
  await env.DB.prepare(
    `INSERT INTO ulangan_attempt (ulangan_id, siswa_id, token_sesi, urutan_soal_json, waktu_mulai, waktu_batas, status)
     VALUES (?, ?, ?, ?, ?, ?, 'berlangsung')`
  )
    .bind(params.id, user.id, token, JSON.stringify(attemptSoal), now.toISOString(), waktuBatas.toISOString())
    .run();

  return created({ token_sesi: token, waktu_batas: waktuBatas.toISOString(), resume: false }, origin);
}

/** Ambil attempt milik siswa berdasarkan token, validasi kepemilikan. */
async function getOwnedAttempt(env, token, siswaId) {
  const attempt = await env.DB.prepare('SELECT * FROM ulangan_attempt WHERE token_sesi = ?').bind(token).first();
  if (!attempt) throw new ApiError('Sesi ujian tidak ditemukan', 404);
  if (attempt.siswa_id !== siswaId) throw new ApiError('Sesi ujian ini bukan milik Anda', 403);
  return attempt;
}

/** Finalisasi attempt: hitung nilai otomatis. statusFinal = 'selesai' | 'timeout' */
async function finalizeAttempt(env, attempt, statusFinal) {
  const soalUrutan = JSON.parse(attempt.urutan_soal_json);
  const { results: jawabanRows } = await env.DB.prepare('SELECT * FROM jawaban_attempt WHERE attempt_id = ?')
    .bind(attempt.id)
    .all();
  const jawabanMap = new Map(jawabanRows.map((j) => [j.soal_id, j]));

  let totalBobot = 0;
  let bobotBenar = 0;
  let jumlahBenar = 0;
  const updateStmts = [];

  for (const item of soalUrutan) {
    const soal = await env.DB.prepare('SELECT * FROM bank_soal WHERE id = ?').bind(item.soal_id).first();
    if (!soal) continue;
    totalBobot += soal.bobot_nilai;
    const jawaban = jawabanMap.get(item.soal_id);
    let isBenar = 0;

    if (jawaban) {
      if (soal.tipe_soal === 'pilihan_ganda' && jawaban.opsi_id) {
        const opsi = await env.DB.prepare('SELECT is_benar FROM opsi_jawaban WHERE id = ?')
          .bind(jawaban.opsi_id)
          .first();
        isBenar = opsi && opsi.is_benar === 1 ? 1 : 0;
      } else if (soal.tipe_soal === 'benar_salah' && jawaban.jawaban_teks) {
        isBenar = jawaban.jawaban_teks.trim().toLowerCase() === String(soal.kunci_jawaban).trim().toLowerCase() ? 1 : 0;
      } else if (soal.tipe_soal === 'isian' && jawaban.jawaban_teks) {
        isBenar =
          jawaban.jawaban_teks.trim().toLowerCase() === String(soal.kunci_jawaban).trim().toLowerCase() ? 1 : 0;
      }
      updateStmts.push(
        env.DB.prepare('UPDATE jawaban_attempt SET is_benar = ? WHERE id = ?').bind(isBenar, jawaban.id)
      );
    }
    if (isBenar) {
      bobotBenar += soal.bobot_nilai;
      jumlahBenar += 1;
    }
  }

  const nilai = totalBobot > 0 ? Math.round((bobotBenar / totalBobot) * 10000) / 100 : 0;

  if (updateStmts.length) await env.DB.batch(updateStmts);
  await env.DB.prepare(
    `UPDATE ulangan_attempt SET status = ?, nilai = ?, jumlah_benar = ?, waktu_submit = datetime('now') WHERE id = ?`
  )
    .bind(statusFinal, nilai, jumlahBenar, attempt.id)
    .run();

  return { nilai, jumlah_benar: jumlahBenar, total_soal: soalUrutan.length };
}

/** GET /api/siswa/attempt/:token/soal - daftar soal (tersanitasi) + jawaban tersimpan (untuk resume) */
export async function getSoalAttempt(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['siswa']);
  let attempt = await getOwnedAttempt(env, params.token, user.id);

  if (attempt.status === 'berlangsung' && new Date() > new Date(attempt.waktu_batas)) {
    await finalizeAttempt(env, attempt, 'timeout');
    attempt = await env.DB.prepare('SELECT * FROM ulangan_attempt WHERE id = ?').bind(attempt.id).first();
  }

  const soalUrutan = JSON.parse(attempt.urutan_soal_json);
  const soalList = [];
  for (const item of soalUrutan) {
    const soal = await env.DB.prepare(
      'SELECT id, tipe_soal, pertanyaan, gambar_url, bobot_nilai FROM bank_soal WHERE id = ?'
    )
      .bind(item.soal_id)
      .first();
    let opsi = [];
    if (soal.tipe_soal === 'pilihan_ganda' && item.opsi_ids.length) {
      const placeholders = item.opsi_ids.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT id, teks_opsi FROM opsi_jawaban WHERE id IN (${placeholders})`
      )
        .bind(...item.opsi_ids)
        .all();
      const byId = new Map(results.map((r) => [r.id, r]));
      opsi = item.opsi_ids.map((id) => byId.get(id)).filter(Boolean);
    }
    soalList.push({ ...soal, opsi });
  }

  const { results: jawabanTersimpan } = await env.DB.prepare(
    'SELECT soal_id, opsi_id, jawaban_teks, ditandai FROM jawaban_attempt WHERE attempt_id = ?'
  )
    .bind(attempt.id)
    .all();

  const sisaDetik =
    attempt.status === 'berlangsung'
      ? Math.max(0, Math.floor((new Date(attempt.waktu_batas) - new Date()) / 1000))
      : 0;

  return ok(
    {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        waktu_batas: attempt.waktu_batas,
        nilai: attempt.nilai,
        sisa_detik: sisaDetik,
      },
      soal: soalList,
      jawaban: jawabanTersimpan,
    },
    origin
  );
}

/** GET /api/siswa/attempt/:token/status - polling sisa waktu server */
export async function statusAttempt(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['siswa']);
  let attempt = await getOwnedAttempt(env, params.token, user.id);

  if (attempt.status === 'berlangsung' && new Date() > new Date(attempt.waktu_batas)) {
    await finalizeAttempt(env, attempt, 'timeout');
    attempt = await env.DB.prepare('SELECT * FROM ulangan_attempt WHERE id = ?').bind(attempt.id).first();
  }
  const sisaDetik =
    attempt.status === 'berlangsung'
      ? Math.max(0, Math.floor((new Date(attempt.waktu_batas) - new Date()) / 1000))
      : 0;
  return ok({ status: attempt.status, sisa_detik: sisaDetik, nilai: attempt.nilai }, origin);
}

/** POST /api/siswa/attempt/:token/jawab - autosave 1 jawaban (+opsional flag ditandai) */
export async function jawabAttempt(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['siswa']);
  const attempt = await getOwnedAttempt(env, params.token, user.id);
  if (attempt.status !== 'berlangsung') {
    throw new ApiError('Sesi ujian sudah berakhir, jawaban tidak dapat disimpan', 409);
  }
  if (new Date() > new Date(attempt.waktu_batas)) {
    await finalizeAttempt(env, attempt, 'timeout');
    throw new ApiError('Waktu ujian sudah habis, jawaban terakhir tidak tersimpan', 409);
  }

  const body = await parseJSON(request);
  if (!body.soal_id) throw new ApiError('soal_id wajib diisi', 422);

  // Pastikan soal_id memang bagian dari attempt ini (cegah manipulasi)
  const soalUrutan = JSON.parse(attempt.urutan_soal_json);
  const valid = soalUrutan.some((s) => s.soal_id === Number(body.soal_id));
  if (!valid) throw new ApiError('Soal tidak ditemukan pada sesi ujian ini', 422);

  const existing = await env.DB.prepare('SELECT * FROM jawaban_attempt WHERE attempt_id = ? AND soal_id = ?')
    .bind(attempt.id, body.soal_id)
    .first();

  const opsiId = body.opsi_id !== undefined ? body.opsi_id : existing?.opsi_id ?? null;
  const jawabanTeks = body.jawaban_teks !== undefined ? body.jawaban_teks : existing?.jawaban_teks ?? null;
  const ditandai = body.ditandai !== undefined ? (body.ditandai ? 1 : 0) : existing?.ditandai ?? 0;

  if (existing) {
    await env.DB.prepare(
      `UPDATE jawaban_attempt SET opsi_id = ?, jawaban_teks = ?, ditandai = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(opsiId, jawabanTeks, ditandai, existing.id)
      .run();
  } else {
    await env.DB.prepare(
      'INSERT INTO jawaban_attempt (attempt_id, soal_id, opsi_id, jawaban_teks, ditandai) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(attempt.id, body.soal_id, opsiId, jawabanTeks, ditandai)
      .run();
  }
  return ok({ message: 'Jawaban tersimpan', tersimpan_pada: new Date().toISOString() }, origin);
}

/** POST /api/siswa/attempt/:token/submit - selesaikan ujian & hitung nilai */
export async function submitAttempt(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['siswa']);
  const attempt = await getOwnedAttempt(env, params.token, user.id);
  if (attempt.status !== 'berlangsung') {
    throw new ApiError('Sesi ujian sudah diselesaikan sebelumnya', 409);
  }
  const isTimeout = new Date() > new Date(attempt.waktu_batas);
  const hasil = await finalizeAttempt(env, attempt, isTimeout ? 'timeout' : 'selesai');
  return ok({ message: 'Ujian berhasil disubmit', ...hasil }, origin);
}
