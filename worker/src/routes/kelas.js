import { ok, created, ApiError, parseJSON, requireFields } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export async function listKelas(request, env, origin) {
  await authenticate(request, env); // semua role login boleh lihat daftar kelas
  const { results } = await env.DB.prepare('SELECT * FROM kelas ORDER BY tingkat, nama_kelas').all();
  return ok(results, origin);
}

export async function createKelas(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  requireFields(body, ['nama_kelas', 'tingkat']);
  try {
    const result = await env.DB.prepare('INSERT INTO kelas (nama_kelas, tingkat) VALUES (?, ?)')
      .bind(String(body.nama_kelas).trim(), Number(body.tingkat))
      .run();
    return created({ id: result.meta.last_row_id }, origin);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ApiError('Nama kelas sudah ada', 409);
    throw e;
  }
}

export async function updateKelas(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  requireFields(body, ['nama_kelas', 'tingkat']);
  const existing = await env.DB.prepare('SELECT id FROM kelas WHERE id = ?').bind(params.id).first();
  if (!existing) throw new ApiError('Kelas tidak ditemukan', 404);
  await env.DB.prepare('UPDATE kelas SET nama_kelas = ?, tingkat = ? WHERE id = ?')
    .bind(String(body.nama_kelas).trim(), Number(body.tingkat), params.id)
    .run();
  return ok({ message: 'Kelas diperbarui' }, origin);
}

export async function deleteKelas(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']);
  const inUse = await env.DB.prepare('SELECT COUNT(*) as total FROM siswa_profil WHERE kelas_id = ?')
    .bind(params.id)
    .first();
  if (inUse.total > 0) {
    throw new ApiError('Kelas tidak bisa dihapus karena masih memiliki siswa terdaftar', 409);
  }
  await env.DB.prepare('DELETE FROM kelas WHERE id = ?').bind(params.id).run();
  return ok({ message: 'Kelas dihapus' }, origin);
}
