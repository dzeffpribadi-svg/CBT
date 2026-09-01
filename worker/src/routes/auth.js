import { hashPassword, verifyPassword, signJWT } from '../lib/crypto.js';
import { ok, ApiError, parseJSON, requireFields } from '../lib/http.js';
import { authenticate } from '../middleware/auth.js';

/** POST /api/auth/login */
export async function login(request, env, origin) {
  const body = await parseJSON(request);
  requireFields(body, ['username', 'password']);
  const username = String(body.username).trim().toLowerCase();

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash, role, nama_lengkap, aktif FROM users WHERE username = ?'
  )
    .bind(username)
    .first();

  // Pesan error digeneralisasi agar tidak bocor info username terdaftar/tidak
  if (!user || user.aktif !== 1) {
    throw new ApiError('Username atau password salah', 401);
  }
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    throw new ApiError('Username atau password salah', 401);
  }

  const token = await signJWT(
    { sub: user.id, role: user.role, username: user.username },
    env.JWT_SECRET,
    12 * 3600 // 12 jam
  );

  let profil = null;
  if (user.role === 'siswa') {
    profil = await env.DB.prepare(
      `SELECT sp.nis, sp.kelas_id, k.nama_kelas
       FROM siswa_profil sp JOIN kelas k ON k.id = sp.kelas_id
       WHERE sp.user_id = ?`
    )
      .bind(user.id)
      .first();
  } else if (user.role === 'guru') {
    const { results: mapelDiampu } = await env.DB.prepare(
      `SELECT m.id, m.nama_mapel FROM guru_mapel gm JOIN mapel m ON m.id = gm.mapel_id WHERE gm.guru_id = ?`
    )
      .bind(user.id)
      .all();
    profil = { mapel_ids: mapelDiampu.map((m) => m.id), mapel: mapelDiampu };
  }

  return ok(
    {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        nama_lengkap: user.nama_lengkap,
        profil,
      },
    },
    origin
  );
}

/** GET /api/auth/me */
export async function me(request, env, origin) {
  const user = await authenticate(request, env);
  return ok({ user }, origin);
}

/** POST /api/auth/change-password */
export async function changePassword(request, env, origin) {
  const user = await authenticate(request, env);
  const body = await parseJSON(request);
  requireFields(body, ['password_lama', 'password_baru']);
  if (String(body.password_baru).length < 8) {
    throw new ApiError('Password baru minimal 8 karakter', 422);
  }
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
  const valid = await verifyPassword(body.password_lama, row.password_hash);
  if (!valid) throw new ApiError('Password lama salah', 401);

  const newHash = await hashPassword(body.password_baru);
  await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?')
    .bind(newHash, user.id)
    .run();
  return ok({ message: 'Password berhasil diubah' }, origin);
}

/**
 * POST /api/auth/setup-admin
 * Endpoint sekali-pakai untuk membuat akun admin pertama.
 * Hanya berjalan jika BELUM ada user dengan role 'admin' di database.
 * Setelah admin pertama dibuat, endpoint ini otomatis terkunci selamanya.
 */
export async function setupAdmin(request, env, origin) {
  const existing = await env.DB.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'admin'").first();
  if (existing.total > 0) {
    throw new ApiError('Setup admin sudah pernah dilakukan. Endpoint ini terkunci.', 403);
  }
  const body = await parseJSON(request);
  requireFields(body, ['username', 'password', 'nama_lengkap']);
  if (String(body.password).length < 8) {
    throw new ApiError('Password minimal 8 karakter', 422);
  }
  const username = String(body.username).trim().toLowerCase();
  const hash = await hashPassword(body.password);
  const result = await env.DB.prepare(
    'INSERT INTO users (username, password_hash, role, nama_lengkap) VALUES (?, ?, "admin", ?)'
  )
    .bind(username, hash, body.nama_lengkap)
    .run();
  return ok({ message: 'Admin pertama berhasil dibuat', id: result.meta.last_row_id }, origin);
}
