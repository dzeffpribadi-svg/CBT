import { ok, created, ApiError, parseJSON, requireFields } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export async function listMapel(request, env, origin) {
  await authenticate(request, env);
  const { results } = await env.DB.prepare('SELECT * FROM mapel ORDER BY nama_mapel').all();
  return ok(results, origin);
}

export async function createMapel(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  requireFields(body, ['nama_mapel', 'kode_mapel']);
  try {
    const result = await env.DB.prepare('INSERT INTO mapel (nama_mapel, kode_mapel) VALUES (?, ?)')
      .bind(String(body.nama_mapel).trim(), String(body.kode_mapel).trim().toUpperCase())
      .run();
    return created({ id: result.meta.last_row_id }, origin);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ApiError('Kode mapel sudah ada', 409);
    throw e;
  }
}

export async function updateMapel(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  const body = await parseJSON(request);
  requireFields(body, ['nama_mapel', 'kode_mapel']);
  const existing = await env.DB.prepare('SELECT id FROM mapel WHERE id = ?').bind(params.id).first();
  if (!existing) throw new ApiError('Mapel tidak ditemukan', 404);
  await env.DB.prepare('UPDATE mapel SET nama_mapel = ?, kode_mapel = ? WHERE id = ?')
    .bind(String(body.nama_mapel).trim(), String(body.kode_mapel).trim().toUpperCase(), params.id)
    .run();
  return ok({ message: 'Mapel diperbarui' }, origin);
}

export async function deleteMapel(request, env, origin, params) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin']);
  const inUse = await env.DB.prepare('SELECT COUNT(*) as total FROM bank_soal WHERE mapel_id = ?')
    .bind(params.id)
    .first();
  if (inUse.total > 0) {
    throw new ApiError('Mapel tidak bisa dihapus karena masih memiliki soal terkait', 409);
  }
  await env.DB.prepare('DELETE FROM mapel WHERE id = ?').bind(params.id).run();
  return ok({ message: 'Mapel dihapus' }, origin);
}
