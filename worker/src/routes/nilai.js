import { ok } from '../lib/http.js';
import { authenticate, requireRole } from '../middleware/auth.js';

/** GET /api/siswa/nilai - riwayat nilai ulangan siswa yang login */
export async function riwayatNilaiSiswa(request, env, origin) {
  const user = await authenticate(request, env);
  requireRole(user, ['siswa']);
  const { results } = await env.DB.prepare(
    `SELECT a.id as attempt_id, a.nilai, a.jumlah_benar, a.status, a.waktu_mulai, a.waktu_submit,
            ul.judul, ul.jumlah_soal, ul.passing_grade, m.nama_mapel
     FROM ulangan_attempt a
     JOIN ulangan ul ON ul.id = a.ulangan_id
     JOIN mapel m ON m.id = ul.mapel_id
     WHERE a.siswa_id = ? AND a.status IN ('selesai','timeout')
     ORDER BY a.waktu_submit DESC`
  )
    .bind(user.id)
    .all();
  return ok(results, origin);
}
