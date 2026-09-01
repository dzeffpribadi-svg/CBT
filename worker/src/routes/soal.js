import { ok, created, ApiError, parseJSON, requireFields } from '../lib/http.js';
import { authenticate, requireRole, assertMapelDiampu } from '../middleware/auth.js';

const TIPE_VALID = ['pilihan_ganda', 'benar_salah', 'isian'];

function validateSoalBody(body) {
  requireFields(body, ['mapel_id', 'tipe_soal', 'pertanyaan']);
  if (!TIPE_VALID.includes(body.tipe_soal)) {
    throw new ApiError(`tipe_soal harus salah satu dari: ${TIPE_VALID.join(', ')}`, 422);
  }
  if (body.tipe_soal === 'pilihan_ganda') {
    if (!Array.isArray(body.opsi) || body.opsi.length < 2) {
      throw new ApiError('Soal pilihan ganda butuh minimal 2 opsi jawaban', 422);
    }
    const benarCount = body.opsi.filter((o) => o.is_benar).length;
    if (benarCount !== 1) {
      throw new ApiError('Soal pilihan ganda harus memiliki tepat 1 opsi jawaban benar', 422);
    }
  }
  if (body.tipe_soal === 'benar_salah') {
    if (!['benar', 'salah'].includes(body.kunci_jawaban)) {
      throw new ApiError('kunci_jawaban untuk benar_salah harus "benar" atau "salah"', 422);
    }
  }
  if (body.tipe_soal === 'isian') {
    if (!body.kunci_jawaban || !String(body.kunci_jawaban).trim()) {
      throw new ApiError('Soal isian butuh kunci_jawaban', 422);
    }
  }
}

/** GET /api/soal?mapel_id=&tipe_soal=&q= */
export async function listSoal(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const url = new URL(request.url);
  const mapelId = url.searchParams.get('mapel_id');
  const tipe = url.searchParams.get('tipe_soal');
  const q = url.searchParams.get('q');

  let sql = `SELECT bs.*, m.nama_mapel, u.nama_lengkap as nama_guru
             FROM bank_soal bs
             JOIN mapel m ON m.id = bs.mapel_id
             JOIN users u ON u.id = bs.guru_id
             WHERE bs.aktif = 1`;
  const binds = [];
  if (user.role === 'guru') {
    sql += ' AND bs.guru_id = ?';
    binds.push(user.id);
  }
  if (mapelId) {
    sql += ' AND bs.mapel_id = ?';
    binds.push(mapelId);
  }
  if (tipe) {
    sql += ' AND bs.tipe_soal = ?';
    binds.push(tipe);
  }
  if (q) {
    sql += ' AND bs.pertanyaan LIKE ?';
    binds.push(`%${q}%`);
  }
  sql += ' ORDER BY bs.created_at DESC';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return ok(results, origin);
}

/** GET /api/soal/:id - detail termasuk opsi jawaban (dengan kunci, untuk guru/admin saja) */
export async function getSoal(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const soal = await env.DB.prepare('SELECT * FROM bank_soal WHERE id = ?').bind(params.id).first();
  if (!soal) throw new ApiError('Soal tidak ditemukan', 404);
  if (user.role === 'guru' && soal.guru_id !== user.id) {
    throw new ApiError('Anda tidak memiliki akses ke soal ini', 403);
  }
  let opsi = [];
  if (soal.tipe_soal === 'pilihan_ganda') {
    const { results } = await env.DB.prepare('SELECT * FROM opsi_jawaban WHERE soal_id = ? ORDER BY urutan')
      .bind(params.id)
      .all();
    opsi = results;
  }
  return ok({ ...soal, opsi }, origin);
}

/** POST /api/soal */
export async function createSoal(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  validateSoalBody(body);

  const mapel = await env.DB.prepare('SELECT id FROM mapel WHERE id = ?').bind(body.mapel_id).first();
  if (!mapel) throw new ApiError('Mapel tidak ditemukan', 404);
  await assertMapelDiampu(env, user, body.mapel_id);

  const result = await env.DB.prepare(
    `INSERT INTO bank_soal (mapel_id, guru_id, tipe_soal, pertanyaan, gambar_url, bobot_nilai, kunci_jawaban, level_kesulitan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.mapel_id,
      user.id,
      body.tipe_soal,
      body.pertanyaan,
      body.gambar_url || null,
      body.bobot_nilai || 1,
      body.tipe_soal === 'pilihan_ganda' ? null : body.kunci_jawaban,
      body.level_kesulitan || 'sedang'
    )
    .run();
  const soalId = result.meta.last_row_id;

  if (body.tipe_soal === 'pilihan_ganda') {
    const stmts = body.opsi.map((o, idx) =>
      env.DB.prepare('INSERT INTO opsi_jawaban (soal_id, teks_opsi, is_benar, urutan) VALUES (?, ?, ?, ?)').bind(
        soalId,
        o.teks_opsi,
        o.is_benar ? 1 : 0,
        idx
      )
    );
    await env.DB.batch(stmts);
  }

  return created({ id: soalId }, origin);
}

/** PUT /api/soal/:id */
export async function updateSoal(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const existing = await env.DB.prepare('SELECT * FROM bank_soal WHERE id = ?').bind(params.id).first();
  if (!existing) throw new ApiError('Soal tidak ditemukan', 404);
  if (user.role === 'guru' && existing.guru_id !== user.id) {
    throw new ApiError('Anda tidak memiliki akses ke soal ini', 403);
  }
  const body = await parseJSON(request);
  validateSoalBody(body);
  await assertMapelDiampu(env, user, body.mapel_id);

  await env.DB.prepare(
    `UPDATE bank_soal SET mapel_id = ?, tipe_soal = ?, pertanyaan = ?, gambar_url = ?, bobot_nilai = ?,
     kunci_jawaban = ?, level_kesulitan = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(
      body.mapel_id,
      body.tipe_soal,
      body.pertanyaan,
      body.gambar_url || null,
      body.bobot_nilai || 1,
      body.tipe_soal === 'pilihan_ganda' ? null : body.kunci_jawaban,
      body.level_kesulitan || 'sedang',
      params.id
    )
    .run();

  if (body.tipe_soal === 'pilihan_ganda') {
    await env.DB.prepare('DELETE FROM opsi_jawaban WHERE soal_id = ?').bind(params.id).run();
    const stmts = body.opsi.map((o, idx) =>
      env.DB.prepare('INSERT INTO opsi_jawaban (soal_id, teks_opsi, is_benar, urutan) VALUES (?, ?, ?, ?)').bind(
        params.id,
        o.teks_opsi,
        o.is_benar ? 1 : 0,
        idx
      )
    );
    await env.DB.batch(stmts);
  } else {
    await env.DB.prepare('DELETE FROM opsi_jawaban WHERE soal_id = ?').bind(params.id).run();
  }

  return ok({ message: 'Soal diperbarui' }, origin);
}

/** DELETE /api/soal/:id - soft delete (nonaktifkan) agar riwayat ulangan lama tetap valid */
export async function deleteSoal(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const existing = await env.DB.prepare('SELECT * FROM bank_soal WHERE id = ?').bind(params.id).first();
  if (!existing) throw new ApiError('Soal tidak ditemukan', 404);
  if (user.role === 'guru' && existing.guru_id !== user.id) {
    throw new ApiError('Anda tidak memiliki akses ke soal ini', 403);
  }
  const dipakai = await env.DB.prepare('SELECT COUNT(*) as total FROM ulangan_soal WHERE soal_id = ?')
    .bind(params.id)
    .first();
  if (dipakai.total > 0) {
    await env.DB.prepare('UPDATE bank_soal SET aktif = 0 WHERE id = ?').bind(params.id).run();
    return ok({ message: 'Soal dinonaktifkan (masih dipakai di ulangan lain, tidak dihapus permanen)' }, origin);
  }
  await env.DB.prepare('DELETE FROM bank_soal WHERE id = ?').bind(params.id).run();
  return ok({ message: 'Soal dihapus' }, origin);
}
