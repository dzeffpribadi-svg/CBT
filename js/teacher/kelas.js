import { api } from '../shared/api.js';
import { toast, confirmDialog } from '../shared/ui.js';

export async function renderKelas() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const daftar = await api.get('/api/kelas');

  app.innerHTML = `
    <div class="flex-between mb-0">
      <h2>Kelola Kelas</h2>
      <button class="btn btn-sm" id="btn-tambah">+ Tambah</button>
    </div>
    <div class="card" id="form-wrap" style="display:none">
      <div class="form-group">
        <label>Nama Kelas</label>
        <input type="text" id="f-nama" placeholder="Contoh: 7A" />
      </div>
      <div class="form-group">
        <label>Tingkat</label>
        <input type="number" id="f-tingkat" placeholder="Contoh: 7" />
      </div>
      <input type="hidden" id="f-id" />
      <div class="flex gap-8">
        <button class="btn btn-success" id="btn-simpan">Simpan</button>
        <button class="btn btn-secondary" id="btn-batal">Batal</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nama Kelas</th><th>Tingkat</th><th></th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
      ${daftar.length === 0 ? '<div class="empty-state">Belum ada kelas</div>' : ''}
    </div>
  `;

  const tbody = app.querySelector('#tbody');
  tbody.innerHTML = daftar
    .map(
      (k) => `
    <tr>
      <td>${k.nama_kelas}</td>
      <td>${k.tingkat}</td>
      <td class="flex gap-8">
        <button class="btn btn-outline btn-sm" data-edit="${k.id}" data-nama="${k.nama_kelas}" data-tingkat="${k.tingkat}">Edit</button>
        <button class="btn btn-danger btn-sm" data-hapus="${k.id}">Hapus</button>
      </td>
    </tr>
  `
    )
    .join('');

  const formWrap = app.querySelector('#form-wrap');
  app.querySelector('#btn-tambah').onclick = () => {
    app.querySelector('#f-id').value = '';
    app.querySelector('#f-nama').value = '';
    app.querySelector('#f-tingkat').value = '';
    formWrap.style.display = 'block';
  };
  app.querySelector('#btn-batal').onclick = () => (formWrap.style.display = 'none');

  app.querySelector('#btn-simpan').onclick = async () => {
    const id = app.querySelector('#f-id').value;
    const nama_kelas = app.querySelector('#f-nama').value.trim();
    const tingkat = app.querySelector('#f-tingkat').value;
    if (!nama_kelas || !tingkat) return toast('Lengkapi semua field', 'error');
    try {
      if (id) await api.put(`/api/kelas/${id}`, { nama_kelas, tingkat });
      else await api.post('/api/kelas', { nama_kelas, tingkat });
      toast('Kelas disimpan', 'success');
      renderKelas();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => {
      app.querySelector('#f-id').value = btn.dataset.edit;
      app.querySelector('#f-nama').value = btn.dataset.nama;
      app.querySelector('#f-tingkat').value = btn.dataset.tingkat;
      formWrap.style.display = 'block';
      formWrap.scrollIntoView({ behavior: 'smooth' });
    };
  });

  tbody.querySelectorAll('[data-hapus]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirmDialog('Hapus kelas ini?')) return;
      try {
        await api.del(`/api/kelas/${btn.dataset.hapus}`);
        toast('Kelas dihapus', 'success');
        renderKelas();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });
}
