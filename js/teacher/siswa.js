import { api } from '../shared/api.js';
import { toast, confirmDialog, escapeHtml } from '../shared/ui.js';

export async function renderSiswa() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const [daftar, kelasList] = await Promise.all([api.get('/api/siswa'), api.get('/api/kelas')]);

  const kelasOptions = kelasList.map((k) => `<option value="${k.id}">${k.nama_kelas}</option>`).join('');

  app.innerHTML = `
    <div class="flex-between mb-0">
      <h2>Kelola Siswa</h2>
      <button class="btn btn-sm" id="btn-tambah">+ Tambah</button>
    </div>
    <div class="card" id="form-wrap" style="display:none">
      <div class="grid grid-2">
        <div class="form-group"><label>Nama Lengkap</label><input type="text" id="f-nama" /></div>
        <div class="form-group"><label>NIS</label><input type="text" id="f-nis" /></div>
        <div class="form-group"><label>Username</label><input type="text" id="f-username" /></div>
        <div class="form-group"><label>Password ${''}<span id="pw-hint" style="font-weight:400"></span></label><input type="password" id="f-password" placeholder="Min. 8 karakter" /></div>
        <div class="form-group"><label>Kelas</label><select id="f-kelas">${kelasOptions}</select></div>
      </div>
      <input type="hidden" id="f-id" />
      <div class="flex gap-8">
        <button class="btn btn-success" id="btn-simpan">Simpan</button>
        <button class="btn btn-secondary" id="btn-batal">Batal</button>
      </div>
    </div>
    <div class="card">
      <div class="form-group mb-0"><input type="text" id="f-cari" placeholder="Cari nama / NIS / username..." /></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table><thead><tr><th>Nama</th><th>NIS</th><th>Kelas</th><th>Username</th><th>Status</th><th></th></tr></thead>
        <tbody id="tbody"></tbody></table>
      </div>
      <div id="empty" class="empty-state hidden">Tidak ada data siswa</div>
    </div>
  `;

  function renderTable(list) {
    const tbody = app.querySelector('#tbody');
    app.querySelector('#empty').classList.toggle('hidden', list.length > 0);
    tbody.innerHTML = list
      .map(
        (s) => `
      <tr>
        <td>${escapeHtml(s.nama_lengkap)}</td>
        <td>${escapeHtml(s.nis)}</td>
        <td>${escapeHtml(s.nama_kelas)}</td>
        <td>${escapeHtml(s.username)}</td>
        <td>${s.aktif ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Nonaktif</span>'}</td>
        <td class="flex gap-8">
          <button class="btn btn-outline btn-sm" data-edit='${JSON.stringify(s)}'>Edit</button>
          <button class="btn btn-danger btn-sm" data-hapus="${s.id}">Hapus</button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.onclick = () => {
        const s = JSON.parse(btn.dataset.edit);
        app.querySelector('#f-id').value = s.id;
        app.querySelector('#f-nama').value = s.nama_lengkap;
        app.querySelector('#f-nis').value = s.nis;
        app.querySelector('#f-username').value = s.username;
        app.querySelector('#f-password').value = '';
        app.querySelector('#pw-hint').textContent = '(kosongkan jika tidak ganti)';
        app.querySelector('#f-kelas').value = s.kelas_id;
        formWrap.style.display = 'block';
        formWrap.scrollIntoView({ behavior: 'smooth' });
      };
    });
    tbody.querySelectorAll('[data-hapus]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirmDialog('Hapus akun siswa ini? Semua riwayat ulangan terkait akan ikut terhapus.')) return;
        try {
          await api.del(`/api/siswa/${btn.dataset.hapus}`);
          toast('Siswa dihapus', 'success');
          renderSiswa();
        } catch (e) {
          toast(e.message, 'error');
        }
      };
    });
  }
  renderTable(daftar);

  app.querySelector('#f-cari').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    renderTable(
      daftar.filter(
        (s) =>
          s.nama_lengkap.toLowerCase().includes(q) ||
          s.nis.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q)
      )
    );
  };

  const formWrap = app.querySelector('#form-wrap');
  app.querySelector('#btn-tambah').onclick = () => {
    ['f-id', 'f-nama', 'f-nis', 'f-username', 'f-password'].forEach((id) => (app.querySelector(`#${id}`).value = ''));
    app.querySelector('#pw-hint').textContent = '';
    formWrap.style.display = 'block';
  };
  app.querySelector('#btn-batal').onclick = () => (formWrap.style.display = 'none');

  app.querySelector('#btn-simpan').onclick = async () => {
    const id = app.querySelector('#f-id').value;
    const nama_lengkap = app.querySelector('#f-nama').value.trim();
    const nis = app.querySelector('#f-nis').value.trim();
    const username = app.querySelector('#f-username').value.trim();
    const password = app.querySelector('#f-password').value;
    const kelas_id = app.querySelector('#f-kelas').value;
    if (!nama_lengkap || !nis || !username || !kelas_id) return toast('Lengkapi semua field wajib', 'error');
    try {
      if (id) {
        const payload = { nama_lengkap, nis, kelas_id };
        if (password) payload.password = password;
        await api.put(`/api/siswa/${id}`, payload);
      } else {
        if (!password || password.length < 8) return toast('Password minimal 8 karakter', 'error');
        await api.post('/api/siswa', { nama_lengkap, nis, username, password, kelas_id });
      }
      toast('Data siswa disimpan', 'success');
      renderSiswa();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}
