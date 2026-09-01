import { ApiError, errorResponse, corsHeaders } from './lib/http.js';
import * as authRoutes from './routes/auth.js';
import * as kelasRoutes from './routes/kelas.js';
import * as mapelRoutes from './routes/mapel.js';
import * as userRoutes from './routes/users.js';
import * as soalRoutes from './routes/soal.js';
import * as ulanganRoutes from './routes/ulangan.js';
import * as ujianRoutes from './routes/ujian.js';
import * as nilaiRoutes from './routes/nilai.js';
import * as uploadRoutes from './routes/upload.js';

// ---------------------------------------------------------------------
// Definisi rute: [METHOD, pola-path dengan :param, handler]
// ---------------------------------------------------------------------
const routes = [
  // Auth
  ['POST', '/api/auth/setup-admin', authRoutes.setupAdmin],
  ['POST', '/api/auth/login', authRoutes.login],
  ['GET', '/api/auth/me', authRoutes.me],
  ['POST', '/api/auth/change-password', authRoutes.changePassword],

  // Kelas
  ['GET', '/api/kelas', kelasRoutes.listKelas],
  ['POST', '/api/kelas', kelasRoutes.createKelas],
  ['PUT', '/api/kelas/:id', kelasRoutes.updateKelas],
  ['DELETE', '/api/kelas/:id', kelasRoutes.deleteKelas],

  // Mapel
  ['GET', '/api/mapel', mapelRoutes.listMapel],
  ['POST', '/api/mapel', mapelRoutes.createMapel],
  ['PUT', '/api/mapel/:id', mapelRoutes.updateMapel],
  ['DELETE', '/api/mapel/:id', mapelRoutes.deleteMapel],

  // Siswa (dikelola guru/admin)
  ['GET', '/api/siswa', userRoutes.listSiswa],
  ['POST', '/api/siswa', userRoutes.createSiswa],
  ['PUT', '/api/siswa/:id', userRoutes.updateSiswa],
  ['DELETE', '/api/siswa/:id', userRoutes.deleteSiswa],

  // Guru (dikelola admin)
  ['GET', '/api/guru', userRoutes.listGuru],
  ['POST', '/api/guru', userRoutes.createGuru],
  ['PUT', '/api/guru/:id', userRoutes.updateGuru],
  ['DELETE', '/api/guru/:id', userRoutes.deleteGuru],
  ['GET', '/api/guru/:id/mapel', userRoutes.listMapelGuru],
  ['PUT', '/api/guru/:id/mapel', userRoutes.setMapelGuru],

  // Bank Soal
  ['GET', '/api/soal', soalRoutes.listSoal],
  ['GET', '/api/soal/:id', soalRoutes.getSoal],
  ['POST', '/api/soal', soalRoutes.createSoal],
  ['PUT', '/api/soal/:id', soalRoutes.updateSoal],
  ['DELETE', '/api/soal/:id', soalRoutes.deleteSoal],

  // Ulangan (guru/admin)
  ['GET', '/api/ulangan', ulanganRoutes.listUlangan],
  ['GET', '/api/ulangan/:id', ulanganRoutes.getUlangan],
  ['POST', '/api/ulangan', ulanganRoutes.createUlangan],
  ['PUT', '/api/ulangan/:id', ulanganRoutes.updateUlangan],
  ['PUT', '/api/ulangan/:id/soal', ulanganRoutes.setSoalUlangan],
  ['POST', '/api/ulangan/:id/publish', ulanganRoutes.publishUlangan],
  ['POST', '/api/ulangan/:id/close', ulanganRoutes.closeUlangan],
  ['DELETE', '/api/ulangan/:id', ulanganRoutes.deleteUlangan],
  ['GET', '/api/ulangan/:id/rekap', ulanganRoutes.rekapNilai],
  ['GET', '/api/ulangan/:id/attempt/:attemptId', ulanganRoutes.detailAttemptGuru],

  // Ujian (siswa)
  ['GET', '/api/siswa/ulangan', ujianRoutes.listUlanganSiswa],
  ['POST', '/api/siswa/ulangan/:id/mulai', ujianRoutes.mulaiUlangan],
  ['GET', '/api/siswa/attempt/:token/soal', ujianRoutes.getSoalAttempt],
  ['GET', '/api/siswa/attempt/:token/status', ujianRoutes.statusAttempt],
  ['POST', '/api/siswa/attempt/:token/jawab', ujianRoutes.jawabAttempt],
  ['POST', '/api/siswa/attempt/:token/submit', ujianRoutes.submitAttempt],

  // Nilai (siswa)
  ['GET', '/api/siswa/nilai', nilaiRoutes.riwayatNilaiSiswa],

  // Upload gambar soal (R2)
  ['POST', '/api/upload', uploadRoutes.uploadImage],
];

function matchRoute(method, pathname) {
  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue;
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler, params };
  }
  return null;
}

// Rate limiting sederhana berbasis IP (in-memory per isolate, mitigasi brute force ringan)
const rateBuckets = new Map();
function checkRateLimit(request, limit = 60, windowMs = 60000) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  recent.push(now);
  rateBuckets.set(ip, recent);
  if (rateBuckets.size > 5000) rateBuckets.clear(); // guard memori isolate
  return recent.length <= limit;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!url.pathname.startsWith('/api/')) {
      return errorResponse('Not found', 404, origin);
    }

    if (!checkRateLimit(request)) {
      return errorResponse('Terlalu banyak permintaan, coba lagi sebentar lagi', 429, origin);
    }

    if (!env.JWT_SECRET) {
      return errorResponse('Server belum dikonfigurasi (JWT_SECRET kosong)', 500, origin);
    }

    // Rute khusus: GET /api/images/<key> - key bisa mengandung "/" (mis. soal/xxx.jpg)
    // sehingga tidak cocok dengan matcher generik berbasis jumlah segmen.
    if (request.method === 'GET' && url.pathname.startsWith('/api/images/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/images/'.length));
      if (!key) return errorResponse('Path gambar tidak valid', 400, origin);
      try {
        return await uploadRoutes.serveImage(request, env, origin, { key });
      } catch (err) {
        if (err instanceof ApiError) return errorResponse(err.message, err.status, origin);
        return errorResponse('Terjadi kesalahan pada server', 500, origin);
      }
    }

    const match = matchRoute(request.method, url.pathname);
    if (!match) {
      return errorResponse('Endpoint tidak ditemukan', 404, origin);
    }

    try {
      return await match.handler(request, env, origin, match.params);
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.message, err.status, origin, err.details);
      }
      console.error('Unhandled error:', err);
      return errorResponse('Terjadi kesalahan pada server', 500, origin);
    }
  },
};
