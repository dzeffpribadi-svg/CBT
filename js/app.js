import { addRoute, startRouter, navigate, setNotFound } from './shared/router.js';
import { isLoggedIn, getUser } from './shared/store.js';
import { renderLogin } from './shared/login.js';
import { renderLayout, clearLayout } from './shared/layout.js';

import { renderDashboardGuru } from './teacher/dashboard.js';
import { renderKelas } from './teacher/kelas.js';
import { renderMapel } from './teacher/mapel.js';
import { renderSiswa } from './teacher/siswa.js';
import { renderGuru } from './teacher/guru.js';
import { renderSoalList, renderSoalForm } from './teacher/soal.js';
import { renderUlanganList, renderUlanganForm, renderUlanganSoal } from './teacher/ulangan.js';
import { renderRekap } from './teacher/rekap.js';

import { renderDashboardSiswa } from './student/dashboard.js';
import { renderUjian } from './student/ujian.js';
import { renderNilaiSiswa } from './student/nilai.js';

// ---------------------------------------------------------------------
// Guard: bungkus handler agar hanya bisa diakses role tertentu
// ---------------------------------------------------------------------
function guard(roles, tabKey, handler, options = {}) {
  return async (params, query) => {
    if (!isLoggedIn()) {
      clearLayout();
      navigate('/login');
      return;
    }
    const user = getUser();
    if (!roles.includes(user.role)) {
      navigate('/');
      return;
    }
    if (options.fullscreen) {
      clearLayout();
    } else {
      renderLayout(tabKey);
      document.getElementById('app').className = 'container';
    }
    await handler(params, query);
  };
}

const GURU_ROLES = ['admin', 'guru'];

addRoute('/login', () => {
  if (isLoggedIn()) return navigate('/');
  clearLayout();
  renderLogin();
});

addRoute(
  '/',
  guard([...GURU_ROLES, 'siswa'], '', async () => {
    const user = getUser();
    if (user.role === 'siswa') navigate('/siswa/ulangan');
    else navigate('/guru/dashboard');
  })
);

// ---- Guru / Admin ----
addRoute('/guru/dashboard', guard(GURU_ROLES, 'dashboard', renderDashboardGuru));
addRoute('/guru/kelas', guard(GURU_ROLES, '', renderKelas));
addRoute('/guru/mapel', guard(GURU_ROLES, '', renderMapel));
addRoute('/guru/siswa', guard(GURU_ROLES, '', renderSiswa));
addRoute('/guru/guru', guard(['admin'], '', renderGuru));
addRoute('/guru/soal', guard(GURU_ROLES, 'soal', renderSoalList));
addRoute('/guru/soal/baru', guard(GURU_ROLES, 'soal', renderSoalForm));
addRoute('/guru/soal/:id/edit', guard(GURU_ROLES, 'soal', renderSoalForm));
addRoute('/guru/ulangan', guard(GURU_ROLES, 'ulangan', renderUlanganList));
addRoute('/guru/ulangan/baru', guard(GURU_ROLES, 'ulangan', renderUlanganForm));
addRoute('/guru/ulangan/:id/edit', guard(GURU_ROLES, 'ulangan', renderUlanganForm));
addRoute('/guru/ulangan/:id/soal', guard(GURU_ROLES, 'ulangan', renderUlanganSoal));
addRoute('/guru/ulangan/:id/rekap', guard(GURU_ROLES, 'ulangan', renderRekap));

// ---- Siswa ----
addRoute('/siswa/ulangan', guard(['siswa'], 'ulangan', renderDashboardSiswa));
addRoute('/siswa/nilai', guard(['siswa'], 'nilai', renderNilaiSiswa));
addRoute(
  '/siswa/ujian/:id',
  guard(['siswa'], 'ulangan', renderUjian, { fullscreen: true })
);

setNotFound(() => {
  document.getElementById('app').innerHTML = '<div class="empty-state">Halaman tidak ditemukan</div>';
});

// ---------------------------------------------------------------------
// Offline banner
// ---------------------------------------------------------------------
function updateOfflineBanner() {
  document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
}
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);
updateOfflineBanner();

// ---------------------------------------------------------------------
// Service worker (PWA installable)
// ---------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW gagal daftar:', err));
  });
}

startRouter();
