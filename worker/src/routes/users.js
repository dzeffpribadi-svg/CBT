import { hashPassword } from '../lib/crypto.js';
import { ok, created, ApiError, parseJSON, requireFields } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';

/** GET /api/siswa?kelas_id=&q= */
export async function listSiswa(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const url = new URL(request.url);
  const kelasId = url.searchParams.get('kelas_id');
  const q = url.searchParams.get('q');

  let sql = `SELECT u.id, u.username, u.nama_lengkap, u.aktif, sp.nis, sp.kelas_id, k.nama_kelas
             FROM users u
             JOIN siswa_profil sp ON sp.user_id = u.id
             JOIN kelas k ON k.id = sp.kelas_id
             WHERE u.role = 'siswa'`;
  const binds = [];
  if (kelasId) {
    sql += ' AND sp.kelas_id = ?';
    binds.push(kelasId);
  }
  if (q) {
    sql += ' AND (u.nama_lengkap LIKE ? OR sp.nis LIKE ? OR u.username LIKE ?)';
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY k.nama_kelas, u.nama_lengkap';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return ok(results, origin);
}

/** POST /api/siswa - buat akun siswa baru */
export async function createSiswa(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  requireFields(body, ['username', 'password', 'nama_lengkap', 'nis', 'kelas_id']);
  if (String(body.password).length < 8) throw new ApiError('Password minimal 8 karakter', 422);

  const kelas = await env.DB.prepare('SELECT id FROM kelas WHERE id = ?').bind(body.kelas_id).first();
  if (!kelas) throw new ApiError('Kelas tidak ditemukan', 404);

  const username = String(body.username).trim().toLowerCase();
  const hash = await hashPassword(body.password);

  try {
    const result = await env.DB.batch([
      env.DB.prepare('INSERT INTO users (username, password_hash, role, nama_lengkap) VALUES (?, ?, "siswa", ?)').bind(
        username,
        hash,
        body.nama_lengkap
      ),
    ]);
    const userId = result[0].meta.last_row_id;
    await env.DB.prepare('INSERT INTO siswa_profil (user_id, nis, kelas_id) VALUES (?, ?, ?)')
      .bind(userId, String(body.nis).trim(), body.kelas_id)
      .run();
    return created({ id: userId }, origin);
  } catch (e) {
    if (String(e.message).includes('UNIQUE') && String(e.message).includes('users.username')) {
      throw new ApiError('Username sudah digunakan', 409);
    }
    if (String(e.message).includes('UNIQUE')) {
      throw new ApiError('NIS sudah digunakan', 409);
    }
    throw e;
  }
}

/** PUT /api/siswa/:id */
export async function updateSiswa(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND role = "siswa"')
    .bind(params.id)
    .first();
  if (!existing) throw new ApiError('Siswa tidak ditemukan', 404);

  if (body.nama_lengkap) {
    await env.DB.prepare('UPDATE users SET nama_lengkap = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(body.nama_lengkap, params.id)
      .run();
  }
  if (body.kelas_id || body.nis) {
    const sets = [];
    const binds = [];
    if (body.kelas_id) {
      sets.push('kelas_id = ?');
      binds.push(body.kelas_id);
    }
    if (body.nis) {
      sets.push('nis = ?');
      binds.push(String(body.nis).trim());
    }
    binds.push(params.id);
    await env.DB.prepare(`UPDATE siswa_profil SET ${sets.join(', ')} WHERE user_id = ?`).bind(...binds).run();
  }
  if (body.password) {
    if (String(body.password).length < 8) throw new ApiError('Password minimal 8 karakter', 422);
    const hash = await hashPassword(body.password);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, params.id).run();
  }
  if (body.aktif !== undefined) {
    await env.DB.prepare('UPDATE users SET aktif = ? WHERE id = ?').bind(body.aktif ? 1 : 0, params.id).run();
  }
  return ok({ message: 'Data siswa diperbarui' }, origin);
}

export async function deleteSiswa(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']);
  await env.DB.prepare('DELETE FROM users WHERE id = ? AND role = "siswa"').bind(params.id).run();
  return ok({ message: 'Siswa dihapus' }, origin);
}

// ---------------------------------------------------------------------
// GURU (dikelola admin)
// ---------------------------------------------------------------------
export async function listGuru(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']);
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.nama_lengkap, u.aktif, gp.nip
     FROM users u LEFT JOIN guru_profil gp ON gp.user_id = u.id
     WHERE u.role = 'guru' ORDER BY u.nama_lengkap`
  ).all();
  return ok(results, origin);
}

export async function createGuru(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']);
  const body = await parseJSON(request);
  requireFields(body, ['username', 'password', 'nama_lengkap']);
  if (String(body.password).length < 8) throw new ApiError('Password minimal 8 karakter', 422);
  const username = String(body.username).trim().toLowerCase();
  const hash = await hashPassword(body.password);
  try {
    const result = await env.DB.prepare(
      'INSERT INTO users (username, password_hash, role, nama_lengkap) VALUES (?, ?, "guru", ?)'
    )
      .bind(username, hash, body.nama_lengkap)
      .run();
    const userId = result.meta.last_row_id;
    await env.DB.prepare('INSERT INTO guru_profil (user_id, nip) VALUES (?, ?)')
      .bind(userId, body.nip ? String(body.nip).trim() : null)
      .run();
    return created({ id: userId }, origin);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ApiError('Username atau NIP sudah digunakan', 409);
    throw e;
  }
}

export async function updateGuru(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']);
  const body = await parseJSON(request);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND role = "guru"')
    .bind(params.id)
    .first();
  if (!existing) throw new ApiError('Guru tidak ditemukan', 404);
  if (body.nama_lengkap) {
    await env.DB.prepare('UPDATE users SET nama_lengkap = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(body.nama_lengkap, params.id)
      .run();
  }
  if (body.password) {
    if (String(body.password).length < 8) throw new ApiError('Password minimal 8 karakter', 422);
    const hash = await hashPassword(body.password);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, params.id).run();
  }
  if (body.aktif !== undefined) {
    await env.DB.prepare('UPDATE users SET aktif = ? WHERE id = ?').bind(body.aktif ? 1 : 0, params.id).run();
  }
  return ok({ message: 'Data guru diperbarui' }, origin);
}

export async function deleteGuru(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']);
  await env.DB.prepare('DELETE FROM users WHERE id = ? AND role = "guru"').bind(params.id).run();
  return ok({ message: 'Guru dihapus' }, origin);
}

// ---------------------------------------------------------------------
// Penugasan mapel per guru (guru_mapel) - membatasi mapel yang boleh
// dikelola seorang guru (soal & ulangan hanya untuk mapel yang diampu).
// Gunakan params.id = "saya" agar guru bisa melihat penugasan mapelnya sendiri.
// ---------------------------------------------------------------------

async function resolveGuruId(request, env, params) {
  const user = await authenticate(request, env);
  if (params.id === 'saya') {
    requireRole(user, ['guru']);
    return { guruId: user.id, requester: user };
  }
  requireRole(user, ['admin']);
  const guru = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND role = "guru"').bind(params.id).first();
  if (!guru) throw new ApiError('Guru tidak ditemukan', 404);
  return { guruId: guru.id, requester: user };
}

/** GET /api/guru/:id/mapel - daftar semua mapel + status apakah diampu guru ini */
export async function listMapelGuru(request, env, origin, params) {
  const { guruId } = await resolveGuruId(request, env, params);
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.nama_mapel, m.kode_mapel,
            CASE WHEN gm.mapel_id IS NULL THEN 0 ELSE 1 END as diampu
     FROM mapel m
     LEFT JOIN guru_mapel gm ON gm.mapel_id = m.id AND gm.guru_id = ?
     ORDER BY m.nama_mapel`
  )
    .bind(guruId)
    .all();
  return ok(results, origin);
}

/** PUT /api/guru/:id/mapel - admin menetapkan mapel yang boleh diampu guru ini */
export async function setMapelGuru(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']); // hanya admin yang boleh mengubah penugasan
  const guru = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND role = "guru"').bind(params.id).first();
  if (!guru) throw new ApiError('Guru tidak ditemukan', 404);

  const body = await parseJSON(request);
  requireFields(body, ['mapel_ids']);
  if (!Array.isArray(body.mapel_ids)) throw new ApiError('mapel_ids harus berupa array', 422);

  await env.DB.prepare('DELETE FROM guru_mapel WHERE guru_id = ?').bind(params.id).run();
  if (body.mapel_ids.length) {
    const stmts = body.mapel_ids.map((mapelId) =>
      env.DB.prepare('INSERT INTO guru_mapel (guru_id, mapel_id) VALUES (?, ?)').bind(params.id, mapelId)
    );
    await env.DB.batch(stmts);
  }
  return ok({ message: 'Penugasan mapel guru diperbarui', total: body.mapel_ids.length }, origin);
}
