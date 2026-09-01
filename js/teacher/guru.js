import { api } from '../shared/api.js';
import { toast, confirmDialog, escapeHtml } from '../shared/ui.js';

export async function renderGuru() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const daftar = await api.get('/api/guru');

  app.innerHTML = `
    <div class="flex-between mb-0">
      <h2>Kelola Guru</h2>
      <button class="btn btn-sm" id="btn-tambah">+ Tambah</button>
    </div>
    <div class="card" id="form-wrap" style="display:none">
      <div class="grid grid-2">
        <div class="form-group"><label>Nama Lengkap</label><input type="text" id="f-nama" /></div>
        <div class="form-group"><label>NIP (opsional)</label><input type="text" id="f-nip" /></div>
        <div class="form-group"><label>Username</label><input type="text" id="f-username" /></div>
        <div class="form-group"><label>Password <span id="pw-hint"></span></label><input type="password" id="f-password" placeholder="Min. 8 karakter" /></div>
      </div>
      <input type="hidden" id="f-id" />
      <div class="flex gap-8">
        <button class="btn btn-success" id="btn-simpan">Simpan</button>
        <button class="btn btn-secondary" id="btn-batal">Batal</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table><thead><tr><th>Nama</th><th>NIP</th><th>Username</th><th>Status</th><th></th></tr></thead>
        <tbody id="tbody"></tbody></table>
      </div>
      ${daftar.length === 0 ? '<div class="empty-state">Belum ada guru</div>' : ''}
    </div>

    <div class="card hidden" id="mapel-wrap">
      <div class="flex-between mb-0">
        <h3 id="mapel-guru-nama" class="mb-0"></h3>
        <button class="btn btn-secondary btn-sm" id="btn-tutup-mapel">Tutup</button>
      </div>
      <p style="font-size:.82rem;color:var(--text-muted)">
        Centang mapel yang boleh diampu guru ini. Guru hanya dapat membuat/mengelola
        soal &amp; ulangan untuk mapel yang dicentang di sini.
      </p>
      <div id="mapel-checklist"></div>
      <button class="btn btn-success mt-8" id="btn-simpan-mapel">Simpan Penugasan Mapel</button>
    </div>
  `;

  const tbody = app.querySelector('#tbody');
  tbody.innerHTML = daftar
    .map(
      (g) => `
    <tr>
      <td>${escapeHtml(g.nama_lengkap)}</td><td>${escapeHtml(g.nip || '-')}</td><td>${escapeHtml(g.username)}</td>
      <td>${g.aktif ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Nonaktif</span>'}</td>
      <td class="flex gap-8" style="flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" data-edit='${JSON.stringify(g)}'>Edit</button>
        <button class="btn btn-outline btn-sm" data-mapel="${g.id}" data-nama="${escapeHtml(g.nama_lengkap)}">Atur Mapel</button>
        <button class="btn ${g.aktif ? 'btn-danger' : 'btn-success'} btn-sm" data-toggle="${g.id}" data-aktif="${g.aktif}">${g.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
      </td>
    </tr>`
    )
    .join('');

  const mapelWrap = app.querySelector('#mapel-wrap');
  app.querySelector('#btn-tutup-mapel').onclick = () => (mapelWrap.style.display = 'none');

  tbody.querySelectorAll('[data-mapel]').forEach((btn) => {
    btn.onclick = async () => {
      const guruId = btn.dataset.mapel;
      app.querySelector('#mapel-guru-nama').textContent = `Mapel Diampu — ${btn.dataset.nama}`;
      const checklist = app.querySelector('#mapel-checklist');
      checklist.innerHTML = `<div class="spinner"></div>`;
      mapelWrap.classList.remove('hidden');
      mapelWrap.style.display = 'block';
      mapelWrap.scrollIntoView({ behavior: 'smooth' });
      try {
        const daftarMapel = await api.get(`/api/guru/${guruId}/mapel`);
        if (daftarMapel.length === 0) {
          checklist.innerHTML = `<div class="empty-state">Belum ada data mapel. Tambahkan mapel terlebih dahulu di menu Mata Pelajaran.</div>`;
        } else {
          checklist.innerHTML = daftarMapel
            .map(
              (m) => `
            <label class="flex gap-8" style="align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <input type="checkbox" class="chk-mapel" value="${m.id}" ${m.diampu ? 'checked' : ''} />
              <span>${escapeHtml(m.nama_mapel)} <span style="color:var(--text-muted)">(${escapeHtml(m.kode_mapel)})</span></span>
            </label>
          `
            )
            .join('');
        }
        app.querySelector('#btn-simpan-mapel').onclick = async () => {
          const ids = [...checklist.querySelectorAll('.chk-mapel:checked')].map((c) => parseInt(c.value, 10));
          try {
            await api.put(`/api/guru/${guruId}/mapel`, { mapel_ids: ids });
            toast('Penugasan mapel disimpan', 'success');
            mapelWrap.style.display = 'none';
          } catch (e) {
            toast(e.message, 'error');
          }
        };
      } catch (e) {
        checklist.innerHTML = '';
        toast(e.message, 'error');
      }
    };
  });

  const formWrap = app.querySelector('#form-wrap');
  app.querySelector('#btn-tambah').onclick = () => {
    ['f-id', 'f-nama', 'f-nip', 'f-username', 'f-password'].forEach((id) => (app.querySelector(`#${id}`).value = ''));
    app.querySelector('#pw-hint').textContent = '';
    formWrap.style.display = 'block';
  };
  app.querySelector('#btn-batal').onclick = () => (formWrap.style.display = 'none');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => {
      const g = JSON.parse(btn.dataset.edit);
      app.querySelector('#f-id').value = g.id;
      app.querySelector('#f-nama').value = g.nama_lengkap;
      app.querySelector('#f-nip').value = g.nip || '';
      app.querySelector('#f-username').value = g.username;
      app.querySelector('#f-password').value = '';
      app.querySelector('#pw-hint').textContent = '(kosongkan jika tidak ganti)';
      formWrap.style.display = 'block';
      formWrap.scrollIntoView({ behavior: 'smooth' });
    };
  });

  tbody.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.onclick = async () => {
      const aktifBaru = btn.dataset.aktif === '1' ? 0 : 1;
      try {
        await api.put(`/api/guru/${btn.dataset.toggle}`, { aktif: aktifBaru });
        toast('Status guru diperbarui', 'success');
        renderGuru();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });

  app.querySelector('#btn-simpan').onclick = async () => {
    const id = app.querySelector('#f-id').value;
    const nama_lengkap = app.querySelector('#f-nama').value.trim();
    const nip = app.querySelector('#f-nip').value.trim();
    const username = app.querySelector('#f-username').value.trim();
    const password = app.querySelector('#f-password').value;
    if (!nama_lengkap || (!id && !username)) return toast('Lengkapi semua field wajib', 'error');
    try {
      if (id) {
        const payload = { nama_lengkap };
        if (password) payload.password = password;
        await api.put(`/api/guru/${id}`, payload);
      } else {
        if (!password || password.length < 8) return toast('Password minimal 8 karakter', 'error');
        await api.post('/api/guru', { nama_lengkap, nip, username, password });
      }
      toast('Data guru disimpan', 'success');
      renderGuru();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}
