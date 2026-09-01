// =====================================================================
// Service Worker - CBT Ulangan Harian Siswa
// Strategi: cache-first untuk app shell (HTML/CSS/JS/icon),
// network-only untuk semua panggilan /api/* (data ujian harus selalu fresh & aman)
// =====================================================================

const CACHE_VERSION = 'cbt-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/shared/api.js',
  '/js/shared/store.js',
  '/js/shared/router.js',
  '/js/shared/offline-queue.js',
  '/js/shared/ui.js',
  '/js/teacher/dashboard.js',
  '/js/teacher/kelas.js',
  '/js/teacher/mapel.js',
  '/js/teacher/siswa.js',
  '/js/teacher/guru.js',
  '/js/teacher/soal.js',
  '/js/teacher/ulangan.js',
  '/js/teacher/rekap.js',
  '/js/student/dashboard.js',
  '/js/student/ujian.js',
  '/js/student/nilai.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Semua request API: selalu ke jaringan, jangan pernah disajikan dari cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            JSON.stringify({ success: false, error: 'Tidak ada koneksi internet', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
      )
    );
    return;
  }

  // App shell: cache-first, fallback ke jaringan, lalu fallback ke index.html untuk navigasi SPA
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('', { status: 504 });
        });
    })
  );
});
