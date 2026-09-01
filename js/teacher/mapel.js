import { api } from '../shared/api.js';
import { toast, confirmDialog } from '../shared/ui.js';

export async function renderMapel() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const daftar = await api.get('/api/mapel');

  app.innerHTML = `
    <div class="flex-between mb-0">
      <h2>Kelola Mata Pelajaran</h2>
      <button class="btn btn-sm" id="btn-tambah">+ Tambah</button>
    </div>
    <div class="card" id="form-wrap" style="display:none">
      <div class="form-group"><label>Nama Mapel</label><input type="text" id="f-nama" placeholder="Contoh: Matematika" /></div>
      <div class="form-group"><label>Kode Mapel</label><input type="text" id="f-kode" placeholder="Contoh: MTK" /></div>
      <input type="hidden" id="f-id" />
      <div class="flex gap-8">
        <button class="btn btn-success" id="btn-simpan">Simpan</button>
        <button class="btn btn-secondary" id="btn-batal">Batal</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table><thead><tr><th>Nama Mapel</th><th>Kode</th><th></th></tr></thead><tbody id="tbody"></tbody></table>
      </div>
      ${daftar.length === 0 ? '<div class="empty-state">Belum ada mapel</div>' : ''}
    </div>
  `;

  const tbody = app.querySelector('#tbody');
  tbody.innerHTML = daftar
    .map(
      (m) => `
    <tr>
      <td>${m.nama_mapel}</td><td>${m.kode_mapel}</td>
      <td class="flex gap-8">
        <button class="btn btn-outline btn-sm" data-edit="${m.id}" data-nama="${m.nama_mapel}" data-kode="${m.kode_mapel}">Edit</button>
        <button class="btn btn-danger btn-sm" data-hapus="${m.id}">Hapus</button>
      </td>
    </tr>`
    )
    .join('');

  const formWrap = app.querySelector('#form-wrap');
  app.querySelector('#btn-tambah').onclick = () => {
    app.querySelector('#f-id').value = '';
    app.querySelector('#f-nama').value = '';
    app.querySelector('#f-kode').value = '';
    formWrap.style.display = 'block';
  };
  app.querySelector('#btn-batal').onclick = () => (formWrap.style.display = 'none');

  app.querySelector('#btn-simpan').onclick = async () => {
    const id = app.querySelector('#f-id').value;
    const nama_mapel = app.querySelector('#f-nama').value.trim();
    const kode_mapel = app.querySelector('#f-kode').value.trim();
    if (!nama_mapel || !kode_mapel) return toast('Lengkapi semua field', 'error');
    try {
      if (id) await api.put(`/api/mapel/${id}`, { nama_mapel, kode_mapel });
      else await api.post('/api/mapel', { nama_mapel, kode_mapel });
      toast('Mapel disimpan', 'success');
      renderMapel();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => {
      app.querySelector('#f-id').value = btn.dataset.edit;
      app.querySelector('#f-nama').value = btn.dataset.nama;
      app.querySelector('#f-kode').value = btn.dataset.kode;
      formWrap.style.display = 'block';
      formWrap.scrollIntoView({ behavior: 'smooth' });
    };
  });
  tbody.querySelectorAll('[data-hapus]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirmDialog('Hapus mapel ini?')) return;
      try {
        await api.del(`/api/mapel/${btn.dataset.hapus}`);
        toast('Mapel dihapus', 'success');
        renderMapel();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });
}
