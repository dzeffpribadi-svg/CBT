import { ok, created, ApiError, parseJSON, requireFields } from '../lib/http.js';
import { authenticate, requireRole, assertMapelDiampu } from '../middleware/auth.js';

/** GET /api/ulangan?kelas_id=&status= */
export async function listUlangan(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const url = new URL(request.url);
  const kelasId = url.searchParams.get('kelas_id');
  const status = url.searchParams.get('status');

  let sql = `SELECT ul.*, m.nama_mapel, k.nama_kelas, u.nama_lengkap as nama_guru,
             (SELECT COUNT(*) FROM ulangan_soal WHERE ulangan_id = ul.id) as total_soal_bank,
             (SELECT COUNT(*) FROM ulangan_attempt WHERE ulangan_id = ul.id AND status != 'berlangsung') as total_selesai
             FROM ulangan ul
             JOIN mapel m ON m.id = ul.mapel_id
             JOIN kelas k ON k.id = ul.kelas_id
             JOIN users u ON u.id = ul.guru_id
             WHERE 1=1`;
  const binds = [];
  if (user.role === 'guru') {
    sql += ' AND ul.guru_id = ?';
    binds.push(user.id);
  }
  if (kelasId) {
    sql += ' AND ul.kelas_id = ?';
    binds.push(kelasId);
  }
  if (status) {
    sql += ' AND ul.status = ?';
    binds.push(status);
  }
  sql += ' ORDER BY ul.waktu_mulai DESC';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return ok(results, origin);
}

/** GET /api/ulangan/:id */
export async function getUlangan(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const ul = await getUlanganOrThrow(env, params.id, user);
  const { results: soalList } = await env.DB.prepare(
    `SELECT us.id as ulangan_soal_id, us.urutan, bs.id as soal_id, bs.tipe_soal, bs.pertanyaan, bs.bobot_nilai
     FROM ulangan_soal us JOIN bank_soal bs ON bs.id = us.soal_id
     WHERE us.ulangan_id = ? ORDER BY us.urutan`
  )
    .bind(params.id)
    .all();
  return ok({ ...ul, soal: soalList }, origin);
}

async function getUlanganOrThrow(env, id, user) {
  const ul = await env.DB.prepare('SELECT * FROM ulangan WHERE id = ?').bind(id).first();
  if (!ul) throw new ApiError('Ulangan tidak ditemukan', 404);
  if (user.role === 'guru' && ul.guru_id !== user.id) {
    throw new ApiError('Anda tidak memiliki akses ke ulangan ini', 403);
  }
  return ul;
}

/** POST /api/ulangan - buat draft ulangan */
export async function createUlangan(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  requireFields(body, ['judul', 'mapel_id', 'kelas_id', 'durasi_menit', 'jumlah_soal', 'waktu_mulai', 'waktu_selesai']);

  if (new Date(body.waktu_selesai) <= new Date(body.waktu_mulai)) {
    throw new ApiError('waktu_selesai harus setelah waktu_mulai', 422);
  }
  if (Number(body.durasi_menit) <= 0 || Number(body.jumlah_soal) <= 0) {
    throw new ApiError('durasi_menit dan jumlah_soal harus lebih dari 0', 422);
  }
  await assertMapelDiampu(env, user, body.mapel_id);

  const result = await env.DB.prepare(
    `INSERT INTO ulangan (judul, deskripsi, mapel_id, kelas_id, guru_id, durasi_menit, jumlah_soal,
     acak_soal, acak_jawaban, waktu_mulai, waktu_selesai, passing_grade, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
  )
    .bind(
      body.judul,
      body.deskripsi || null,
      body.mapel_id,
      body.kelas_id,
      user.id,
      body.durasi_menit,
      body.jumlah_soal,
      body.acak_soal === false ? 0 : 1,
      body.acak_jawaban === false ? 0 : 1,
      new Date(body.waktu_mulai).toISOString(),
      new Date(body.waktu_selesai).toISOString(),
      body.passing_grade || null
    )
    .run();
  return created({ id: result.meta.last_row_id }, origin);
}

/** PUT /api/ulangan/:id - hanya boleh diedit jika status draft */
export async function updateUlangan(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const ul = await getUlanganOrThrow(env, params.id, user);
  if (ul.status !== 'draft') {
    throw new ApiError('Ulangan yang sudah dipublikasikan tidak bisa diedit. Tutup lalu buat ulangan baru.', 409);
  }
  const body = await parseJSON(request);
  requireFields(body, ['judul', 'mapel_id', 'kelas_id', 'durasi_menit', 'jumlah_soal', 'waktu_mulai', 'waktu_selesai']);
  if (new Date(body.waktu_selesai) <= new Date(body.waktu_mulai)) {
    throw new ApiError('waktu_selesai harus setelah waktu_mulai', 422);
  }
  await assertMapelDiampu(env, user, body.mapel_id);
  await env.DB.prepare(
    `UPDATE ulangan SET judul=?, deskripsi=?, mapel_id=?, kelas_id=?, durasi_menit=?, jumlah_soal=?,
     acak_soal=?, acak_jawaban=?, waktu_mulai=?, waktu_selesai=?, passing_grade=?, updated_at=datetime('now')
     WHERE id = ?`
  )
    .bind(
      body.judul,
      body.deskripsi || null,
      body.mapel_id,
      body.kelas_id,
      body.durasi_menit,
      body.jumlah_soal,
      body.acak_soal === false ? 0 : 1,
      body.acak_jawaban === false ? 0 : 1,
      new Date(body.waktu_mulai).toISOString(),
      new Date(body.waktu_selesai).toISOString(),
      body.passing_grade || null,
      params.id
    )
    .run();
  return ok({ message: 'Ulangan diperbarui' }, origin);
}

/** PUT /api/ulangan/:id/soal - set daftar soal (pool bank soal) untuk ulangan ini */
export async function setSoalUlangan(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const ul = await getUlanganOrThrow(env, params.id, user);
  if (ul.status !== 'draft') {
    throw new ApiError('Soal ulangan hanya bisa diubah selama status masih draft', 409);
  }
  const body = await parseJSON(request);
  requireFields(body, ['soal_ids']);
  if (!Array.isArray(body.soal_ids) || body.soal_ids.length === 0) {
    throw new ApiError('soal_ids harus berupa array dan tidak kosong', 422);
  }
  if (body.soal_ids.length < ul.jumlah_soal) {
    throw new ApiError(
      `Pool soal (${body.soal_ids.length}) harus >= jumlah_soal ulangan (${ul.jumlah_soal}) agar bisa diacak per siswa`,
      422
    );
  }
  await env.DB.prepare('DELETE FROM ulangan_soal WHERE ulangan_id = ?').bind(params.id).run();
  const stmts = body.soal_ids.map((soalId, idx) =>
    env.DB.prepare('INSERT INTO ulangan_soal (ulangan_id, soal_id, urutan) VALUES (?, ?, ?)').bind(
      params.id,
      soalId,
      idx
    )
  );
  await env.DB.batch(stmts);
  return ok({ message: 'Soal ulangan diperbarui', total: body.soal_ids.length }, origin);
}

/** POST /api/ulangan/:id/publish */
export async function publishUlangan(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const ul = await getUlanganOrThrow(env, params.id, user);
  if (ul.status !== 'draft') throw new ApiError('Hanya ulangan berstatus draft yang bisa dipublikasikan', 409);

  const poolCount = await env.DB.prepare('SELECT COUNT(*) as total FROM ulangan_soal WHERE ulangan_id = ?')
    .bind(params.id)
    .first();
  if (poolCount.total < ul.jumlah_soal) {
    throw new ApiError('Pool soal belum mencukupi jumlah_soal yang ditentukan', 409);
  }
  await env.DB.prepare("UPDATE ulangan SET status = 'published', updated_at = datetime('now') WHERE id = ?")
    .bind(params.id)
    .run();
  return ok({ message: 'Ulangan dipublikasikan dan dapat dikerjakan siswa sesuai jadwal' }, origin);
}

/** POST /api/ulangan/:id/close - tutup paksa ulangan */
export async function closeUlangan(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  await getUlanganOrThrow(env, params.id, user);
  await env.DB.prepare("UPDATE ulangan SET status = 'closed', updated_at = datetime('now') WHERE id = ?")
    .bind(params.id)
    .run();
  return ok({ message: 'Ulangan ditutup' }, origin);
}

/** DELETE /api/ulangan/:id - hanya draft */
export async function deleteUlangan(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const ul = await getUlanganOrThrow(env, params.id, user);
  if (ul.status !== 'draft') throw new ApiError('Hanya ulangan draft yang bisa dihapus', 409);
  await env.DB.prepare('DELETE FROM ulangan WHERE id = ?').bind(params.id).run();
  return ok({ message: 'Ulangan dihapus' }, origin);
}

/** GET /api/ulangan/:id/rekap - rekap nilai seluruh siswa pada ulangan ini */
export async function rekapNilai(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const ul = await getUlanganOrThrow(env, params.id, user);

  const { results: peserta } = await env.DB.prepare(
    `SELECT u.id as siswa_id, u.nama_lengkap, sp.nis,
            a.id as attempt_id, a.status, a.nilai, a.jumlah_benar, a.waktu_mulai, a.waktu_submit
     FROM users u
     JOIN siswa_profil sp ON sp.user_id = u.id
     LEFT JOIN ulangan_attempt a ON a.siswa_id = u.id AND a.ulangan_id = ?
     WHERE sp.kelas_id = ? AND u.role = 'siswa' AND u.aktif = 1
     ORDER BY u.nama_lengkap`
  )
    .bind(params.id, ul.kelas_id)
    .all();

  const selesai = peserta.filter((p) => p.status === 'selesai' || p.status === 'timeout');
  const rataRata = selesai.length
    ? Math.round((selesai.reduce((s, p) => s + (p.nilai || 0), 0) / selesai.length) * 100) / 100
    : 0;
  const tertinggi = selesai.length ? Math.max(...selesai.map((p) => p.nilai || 0)) : 0;
  const terendah = selesai.length ? Math.min(...selesai.map((p) => p.nilai || 0)) : 0;

  return ok(
    {
      ulangan: ul,
      peserta,
      statistik: {
        total_siswa: peserta.length,
        sudah_mengerjakan: selesai.length,
        belum_mengerjakan: peserta.length - selesai.length,
        rata_rata: rataRata,
        nilai_tertinggi: tertinggi,
        nilai_terendah: terendah,
      },
    },
    origin
  );
}

/** GET /api/ulangan/:id/attempt/:attemptId - detail jawaban 1 siswa untuk koreksi manual/lihat */
export async function detailAttemptGuru(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const ul = await getUlanganOrThrow(env, params.id, user);
  const attempt = await env.DB.prepare(
    `SELECT a.*, u.nama_lengkap, sp.nis FROM ulangan_attempt a
     JOIN users u ON u.id = a.siswa_id JOIN siswa_profil sp ON sp.user_id = u.id
     WHERE a.id = ? AND a.ulangan_id = ?`
  )
    .bind(params.attemptId, params.id)
    .first();
  if (!attempt) throw new ApiError('Data pengerjaan tidak ditemukan', 404);

  const { results: jawaban } = await env.DB.prepare(
    `SELECT j.*, bs.pertanyaan, bs.tipe_soal, bs.kunci_jawaban, bs.bobot_nilai,
            oj.teks_opsi as jawaban_opsi_teks
     FROM jawaban_attempt j
     JOIN bank_soal bs ON bs.id = j.soal_id
     LEFT JOIN opsi_jawaban oj ON oj.id = j.opsi_id
     WHERE j.attempt_id = ?`
  )
    .bind(params.attemptId)
    .all();

  return ok({ attempt, jawaban }, origin);
}
