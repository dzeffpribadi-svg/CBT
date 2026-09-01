import { ok, created, ApiError, parseJSON, requireFields } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { randomToken } from '../lib/crypto.js';

const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function base64ToUint8Array(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** POST /api/upload - body: { filename, content_type, data_base64 } (khusus gambar soal) */
export async function uploadImage(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['admin', 'guru']);
  if (!env.IMAGES) {
    throw new ApiError('Penyimpanan gambar (R2 bucket) belum dikonfigurasi di server', 500);
  }
  const body = await parseJSON(request);
  requireFields(body, ['filename', 'content_type', 'data_base64']);
  if (!ALLOWED_TYPES.includes(body.content_type)) {
    throw new ApiError('Tipe file harus gambar (png/jpeg/webp/gif)', 422);
  }
  const bytes = base64ToUint8Array(body.data_base64.split(',').pop());
  if (bytes.byteLength > MAX_SIZE_BYTES) {
    throw new ApiError('Ukuran gambar maksimal 3MB', 422);
  }
  const safeExt = (body.filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `soal/${Date.now()}-${randomToken(6)}.${safeExt}`;
  await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: body.content_type } });
  return created({ url: `/api/images/${key}` }, origin);
}

/** GET /api/images/:key(+) - sajikan gambar dari R2. Path param di-encode sebagai satu segmen? lihat index.js */
export async function serveImage(request, env, origin, params) {
  if (!env.IMAGES) throw new ApiError('Penyimpanan gambar belum dikonfigurasi', 500);
  const key = params.key;
  const obj = await env.IMAGES.get(key);
  if (!obj) throw new ApiError('Gambar tidak ditemukan', 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', origin || '*');
  return new Response(obj.body, { headers });
}
