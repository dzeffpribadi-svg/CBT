import { api } from '../shared/api.js';
import { toast, formatDateTime, badgeStatus, confirmDialog, escapeHtml } from '../shared/ui.js';
import { navigate } from '../shared/router.js';
import { getUser } from '../shared/store.js';

export async function renderDashboardSiswa() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const user = getUser();
  const daftar = await api.get('/api/siswa/ulangan');

  app.innerHTML = `
    <div class="card">
      <h2 class="mb-0">Halo, ${escapeHtml(user.nama_lengkap)} 👋</h2>
      <p style="color:var(--text-muted);margin-top:4px">${user.profil ? `Kelas ${escapeHtml(user.profil.nama_kelas)}` : ''}</p>
    </div>
    <h3>Daftar Ulangan</h3>
    <div id="list"></div>
    ${daftar.length === 0 ? '<div class="empty-state">Belum ada ulangan untuk kelas Anda</div>' : ''}
  `;

  const list = app.querySelector('#list');
  list.innerHTML = daftar
    .map(
      (u) => `
    <div class="card">
      <div class="flex-between">
        <strong>${escapeHtml(u.judul)}</strong>
        ${badgeStatus(u.status_tampil)}
      </div>
      <div style="font-size:.82rem;color:var(--text-muted);margin:6px 0">
        ${escapeHtml(u.nama_mapel)} · ${u.durasi_menit} menit · ${u.jumlah_soal} soal
      </div>
      <div style="font-size:.78rem;color:var(--text-muted)">
        Jadwal: ${formatDateTime(u.waktu_mulai)} → ${formatDateTime(u.waktu_selesai)}
      </div>
      ${u.nilai !== null && u.nilai !== undefined ? `<div style="font-weight:700;margin-top:6px">Nilai: ${u.nilai}</div>` : ''}
      <div class="mt-8">
        ${actionButton(u)}
      </div>
    </div>
  `
    )
    .join('');

  function actionButton(u) {
    if (u.status_tampil === 'sudah_selesai') return '';
    if (u.status_tampil === 'belum_dibuka' || u.status_tampil === 'sudah_ditutup') {
      return `<button class="btn btn-secondary btn-sm" disabled>${u.status_tampil === 'belum_dibuka' ? 'Belum Dibuka' : 'Sudah Ditutup'}</button>`;
    }
    if (u.status_tampil === 'sedang_berlangsung') {
      return `<button class="btn btn-sm" data-lanjut="${u.id}">Lanjutkan Mengerjakan</button>`;
    }
    return `<button class="btn btn-success btn-sm" data-mulai="${u.id}">Mulai Ujian</button>`;
  }

  list.querySelectorAll('[data-lanjut]').forEach((btn) => {
    btn.onclick = () => navigate(`/siswa/ujian/${btn.dataset.lanjut}`);
  });
  list.querySelectorAll('[data-mulai]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirmDialog('Ulangan hanya bisa dikerjakan SATU KALI. Timer akan langsung berjalan. Mulai sekarang?')) return;
      navigate(`/siswa/ujian/${btn.dataset.mulai}`);
    };
  });
}
