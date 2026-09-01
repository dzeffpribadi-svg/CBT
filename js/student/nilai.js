import { api } from '../shared/api.js';
import { formatDateTime, badgeStatus, escapeHtml } from '../shared/ui.js';

export async function renderNilaiSiswa() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const daftar = await api.get('/api/siswa/nilai');

  app.innerHTML = `
    <h2>Riwayat Nilai</h2>
    <div id="list"></div>
    ${daftar.length === 0 ? '<div class="empty-state">Belum ada riwayat ulangan</div>' : ''}
  `;
  app.querySelector('#list').innerHTML = daftar
    .map(
      (n) => `
    <div class="card">
      <div class="flex-between">
        <strong>${escapeHtml(n.judul)}</strong>
        ${badgeStatus(n.status)}
      </div>
      <div style="font-size:.8rem;color:var(--text-muted);margin:4px 0">${escapeHtml(n.nama_mapel)}</div>
      <div class="flex-between mt-8">
        <span style="font-size:.78rem;color:var(--text-muted)">${formatDateTime(n.waktu_submit)}</span>
        <span style="font-size:1.4rem;font-weight:800">${n.nilai}</span>
      </div>
      <div style="font-size:.78rem;color:var(--text-muted)">Benar ${n.jumlah_benar} dari ${n.jumlah_soal} soal</div>
    </div>
  `
    )
    .join('');
}
