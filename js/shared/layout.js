import { getUser, clearSession } from './store.js';
import { navigate } from './router.js';
import { escapeHtml } from './ui.js';

export function renderLayout(activeTab) {
  const user = getUser();
  if (!user) return;

  document.getElementById('topbar-mount').innerHTML = `
    <div class="topbar">
      <h1>CBT Ulangan Harian</h1>
      <div class="flex gap-8" style="align-items:center">
        <span class="user-info">${escapeHtml(user.nama_lengkap)}</span>
        <button class="btn-icon" id="btn-logout" title="Keluar">⏻</button>
      </div>
    </div>
  `;
  document.getElementById('btn-logout').onclick = () => {
    if (!window.confirm('Keluar dari akun?')) return;
    clearSession();
    navigate('/login');
  };

  const tabs =
    user.role === 'siswa'
      ? [
          { key: 'ulangan', label: 'Ulangan', icon: '📝', href: '/siswa/ulangan' },
          { key: 'nilai', label: 'Nilai', icon: '📊', href: '/siswa/nilai' },
        ]
      : [
          { key: 'dashboard', label: 'Beranda', icon: '🏠', href: '/guru/dashboard' },
          { key: 'ulangan', label: 'Ulangan', icon: '📝', href: '/guru/ulangan' },
          { key: 'soal', label: 'Bank Soal', icon: '📚', href: '/guru/soal' },
        ];

  document.getElementById('tabbar-mount').innerHTML = `
    <div class="tabbar">
      ${tabs
        .map(
          (t) => `
        <button class="${t.key === activeTab ? 'active' : ''}" data-href="${t.href}">
          <span class="icon">${t.icon}</span>${t.label}
        </button>
      `
        )
        .join('')}
    </div>
  `;
  document.querySelectorAll('.tabbar [data-href]').forEach((btn) => {
    btn.onclick = () => navigate(btn.dataset.href);
  });
}

export function clearLayout() {
  document.getElementById('topbar-mount').innerHTML = '';
  document.getElementById('tabbar-mount').innerHTML = '';
}
