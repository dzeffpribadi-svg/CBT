import { api } from '../shared/api.js';
import { formatDateTime, badgeStatus, escapeHtml } from '../shared/ui.js';
import { navigate } from '../shared/router.js';

export async function renderRekap(params) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const data = await api.get(`/api/ulangan/${params.id}/rekap`);
  const { ulangan, peserta, statistik } = data;

  app.innerHTML = `
    <button class="btn btn-outline btn-sm" id="btn-kembali">← Kembali</button>
    <h2>${escapeHtml(ulangan.judul)}</h2>
    <div class="grid grid-3">
      <div class="card text-center"><div style="font-size:1.6rem;font-weight:800">${statistik.rata_rata}</div><div style="font-size:.78rem;color:var(--text-muted)">Rata-rata</div></div>
      <div class="card text-center"><div style="font-size:1.6rem;font-weight:800">${statistik.nilai_tertinggi}</div><div style="font-size:.78rem;color:var(--text-muted)">Tertinggi</div></div>
      <div class="card text-center"><div style="font-size:1.6rem;font-weight:800">${statistik.nilai_terendah}</div><div style="font-size:.78rem;color:var(--text-muted)">Terendah</div></div>
    </div>
    <div class="card text-center">
      ${statistik.sudah_mengerjakan} / ${statistik.total_siswa} siswa sudah mengerjakan
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nama</th><th>NIS</th><th>Status</th><th>Nilai</th><th>Waktu Submit</th></tr></thead>
          <tbody>
            ${peserta
              .map(
                (p) => `
              <tr>
                <td>${escapeHtml(p.nama_lengkap)}</td>
                <td>${escapeHtml(p.nis)}</td>
                <td>${badgeStatus(p.status || 'belum_dibuka')}</td>
                <td>${p.nilai !== null && p.nilai !== undefined ? p.nilai : '-'}</td>
                <td style="font-size:.78rem">${p.waktu_submit ? formatDateTime(p.waktu_submit) : '-'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  app.querySelector('#btn-kembali').onclick = () => navigate('/guru/ulangan');
}
