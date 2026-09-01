import { getUser } from '../shared/store.js';

export async function renderDashboardGuru() {
  const user = getUser();
  const isAdmin = user.role === 'admin';
  document.getElementById('app').innerHTML = `
    <div class="card">
      <h2 class="mb-0">Halo, ${user.nama_lengkap} 👋</h2>
      <p style="color:var(--text-muted);margin-top:4px">${isAdmin ? 'Administrator' : 'Guru'} · Kelola ulangan harian siswa</p>
    </div>
    <div class="grid grid-3">
      ${menuItem('#/guru/ulangan', '📝', 'Ulangan', 'Buat & kelola ulangan')}
      ${menuItem('#/guru/soal', '📚', 'Bank Soal', 'Kelola bank soal')}
      ${menuItem('#/guru/kelas', '🏫', 'Kelas', 'Kelola data kelas')}
      ${menuItem('#/guru/mapel', '📖', 'Mata Pelajaran', 'Kelola mapel')}
      ${menuItem('#/guru/siswa', '🧑‍🎓', 'Siswa', 'Kelola akun siswa')}
      ${isAdmin ? menuItem('#/guru/guru', '🧑‍🏫', 'Guru', 'Kelola akun guru') : ''}
    </div>
  `;
}

function menuItem(href, icon, title, desc) {
  return `
    <a class="card" href="${href}" style="text-decoration:none;color:inherit;display:block">
      <div style="font-size:1.8rem">${icon}</div>
      <div style="font-weight:700;margin-top:6px">${title}</div>
      <div style="font-size:.8rem;color:var(--text-muted)">${desc}</div>
    </a>
  `;
}
