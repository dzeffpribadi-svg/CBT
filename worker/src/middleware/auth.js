import { verifyJWT } from '../lib/crypto.js';
import { ApiError } from '../lib/http.js';

/** Ambil & verifikasi user dari header Authorization: Bearer <token>. */
export async function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiError('Token otorisasi tidak ditemukan', 401);
  }
  const token = match[1];
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) {
    throw new ApiError('Token tidak valid atau sudah kedaluwarsa', 401);
  }
  // Pastikan user masih aktif di DB (deteksi akun dihapus/nonaktif setelah token terbit)
  const row = await env.DB.prepare('SELECT id, username, role, nama_lengkap, aktif FROM users WHERE id = ?')
    .bind(payload.sub)
    .first();
  if (!row || row.aktif !== 1) {
    throw new ApiError('Akun tidak aktif atau tidak ditemukan', 401);
  }
  return { id: row.id, username: row.username, role: row.role, nama_lengkap: row.nama_lengkap };
}

/** Wajibkan role tertentu. roles: array string. */
export function requireRole(user, roles) {
  if (!roles.includes(user.role)) {
    throw new ApiError('Anda tidak memiliki akses untuk aksi ini', 403);
  }
}

/**
 * Pastikan guru yang login memang ditugaskan mengampu mapel tersebut
 * (lihat tabel guru_mapel). Admin selalu lolos (tidak dibatasi).
 * Dipakai saat guru membuat/mengedit soal & ulangan.
 */
export async function assertMapelDiampu(env, user, mapelId) {
  if (user.role !== 'guru') return; // admin tidak dibatasi
  const row = await env.DB.prepare('SELECT 1 FROM guru_mapel WHERE guru_id = ? AND mapel_id = ?')
    .bind(user.id, mapelId)
    .first();
  if (!row) {
    throw new ApiError('Anda tidak ditugaskan mengampu mata pelajaran ini. Hubungi admin untuk penugasan mapel.', 403);
  }
}
