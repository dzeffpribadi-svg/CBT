import { api } from '../shared/api.js';
import { toast, confirmDialog, formatDateTime, badgeStatus, escapeHtml } from '../shared/ui.js';
import { navigate } from '../shared/router.js';
import { getUser } from '../shared/store.js';

function filterMapelUntukUser(mapelList) {
  const user = getUser();
  if (user.role === 'admin' || !user.profil?.mapel_ids) return mapelList;
  const allowed = new Set(user.profil.mapel_ids);
  return mapelList.filter((m) => allowed.has(m.id));
}

export async function renderUlanganList() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const daftar = await api.get('/api/ulangan');

  app.innerHTML = `
    <div class="flex-between mb-0">
      <h2>Ulangan</h2>
      <button class="btn btn-sm" id="btn-tambah">+ Buat Ulangan</button>
    </div>
    <div id="list"></div>
    ${daftar.length === 0 ? '<div class="empty-state">Belum ada ulangan dibuat</div>' : ''}
  `;
  app.querySelector('#btn-tambah').onclick = () => navigate('/guru/ulangan/baru');

  app.querySelector('#list').innerHTML = daftar
    .map(
      (u) => `
    <div class="card">
      <div class="flex-between">
        <strong>${escapeHtml(u.judul)}</strong>
        ${badgeStatus(u.status)}
      </div>
      <div style="font-size:.82rem;color:var(--text-muted);margin:6px 0">
        ${escapeHtml(u.nama_mapel)} · Kelas ${escapeHtml(u.nama_kelas)} · ${u.durasi_menit} menit · ${u.jumlah_soal} soal
      </div>
      <div style="font-size:.78rem;color:var(--text-muted)">
        ${formatDateTime(u.waktu_mulai)} → ${formatDateTime(u.waktu_selesai)}
      </div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px">Sudah mengerjakan: ${u.total_selesai}</div>
      <div class="flex gap-8 mt-8" style="flex-wrap:wrap">
        ${u.status === 'draft' ? `<button class="btn btn-outline btn-sm" data-edit="${u.id}">Edit</button>` : ''}
        ${u.status === 'draft' ? `<button class="btn btn-outline btn-sm" data-soal="${u.id}">Atur Soal (${u.total_soal_bank})</button>` : ''}
        ${u.status === 'draft' ? `<button class="btn btn-success btn-sm" data-publish="${u.id}">Publikasikan</button>` : ''}
        ${u.status === 'published' ? `<button class="btn btn-danger btn-sm" data-close="${u.id}">Tutup Ulangan</button>` : ''}
        ${u.status !== 'draft' ? `<button class="btn btn-outline btn-sm" data-rekap="${u.id}">Lihat Rekap Nilai</button>` : ''}
        ${u.status === 'draft' ? `<button class="btn btn-danger btn-sm" data-hapus="${u.id}">Hapus</button>` : ''}
      </div>
    </div>
  `
    )
    .join('');

  const list = app.querySelector('#list');
  list.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => navigate(`/guru/ulangan/${b.dataset.edit}/edit`)));
  list.querySelectorAll('[data-soal]').forEach((b) => (b.onclick = () => navigate(`/guru/ulangan/${b.dataset.soal}/soal`)));
  list.querySelectorAll('[data-rekap]').forEach((b) => (b.onclick = () => navigate(`/guru/ulangan/${b.dataset.rekap}/rekap`)));
  list.querySelectorAll('[data-publish]').forEach((b) => {
    b.onclick = async () => {
      if (!confirmDialog('Publikasikan ulangan ini? Siswa akan bisa mulai mengerjakan sesuai jadwal.')) return;
      try {
        await api.post(`/api/ulangan/${b.dataset.publish}/publish`);
        toast('Ulangan dipublikasikan', 'success');
        renderUlanganList();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });
  list.querySelectorAll('[data-close]').forEach((b) => {
    b.onclick = async () => {
      if (!confirmDialog('Tutup ulangan ini sekarang? Siswa tidak akan bisa memulai lagi.')) return;
      try {
        await api.post(`/api/ulangan/${b.dataset.close}/close`);
        toast('Ulangan ditutup', 'success');
        renderUlanganList();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });
  list.querySelectorAll('[data-hapus]').forEach((b) => {
    b.onclick = async () => {
      if (!confirmDialog('Hapus ulangan draft ini?')) return;
      try {
        await api.del(`/api/ulangan/${b.dataset.hapus}`);
        toast('Ulangan dihapus', 'success');
        renderUlanganList();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });
}

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function renderUlanganForm(params) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const isEdit = !!params.id;
  const [mapelListRaw, kelasList, ulanganData] = await Promise.all([
    api.get('/api/mapel'),
    api.get('/api/kelas'),
    isEdit ? api.get(`/api/ulangan/${params.id}`) : Promise.resolve(null),
  ]);
  let mapelList = filterMapelUntukUser(mapelListRaw);
  if (isEdit && ulanganData && !mapelList.some((m) => m.id === ulanganData.mapel_id)) {
    const mapelAsli = mapelListRaw.find((m) => m.id === ulanganData.mapel_id);
    if (mapelAsli) mapelList = [mapelAsli, ...mapelList];
  }

  if (mapelList.length === 0) {
    app.innerHTML = `<div class="card"><p>Anda belum ditugaskan mengampu mata pelajaran apa pun. Hubungi admin untuk penugasan mapel terlebih dahulu.</p><button class="btn mt-8" id="btn-kembali">Kembali</button></div>`;
    app.querySelector('#btn-kembali').onclick = () => navigate('/guru/ulangan');
    return;
  }

  app.innerHTML = `
    <h2>${isEdit ? 'Edit Ulangan' : 'Buat Ulangan'}</h2>
    <div class="card">
      <div class="form-group"><label>Judul Ulangan</label><input type="text" id="f-judul" /></div>
      <div class="form-group"><label>Deskripsi (opsional)</label><textarea id="f-deskripsi"></textarea></div>
      <div class="grid grid-2">
        <div class="form-group"><label>Mata Pelajaran</label>
          <select id="f-mapel">${mapelList.map((m) => `<option value="${m.id}">${escapeHtml(m.nama_mapel)}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Kelas</label>
          <select id="f-kelas">${kelasList.map((k) => `<option value="${k.id}">${escapeHtml(k.nama_kelas)}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Durasi (menit)</label><input type="number" id="f-durasi" value="60" /></div>
        <div class="form-group"><label>Jumlah Soal Ditampilkan</label><input type="number" id="f-jumlah" value="20" /></div>
        <div class="form-group"><label>Waktu Mulai</label><input type="datetime-local" id="f-mulai" /></div>
        <div class="form-group"><label>Waktu Selesai</label><input type="datetime-local" id="f-selesai" /></div>
        <div class="form-group"><label>Passing Grade (opsional)</label><input type="number" id="f-passing" /></div>
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="f-acak-soal" checked /> Acak urutan soal per siswa</label>
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="f-acak-jawaban" checked /> Acak urutan opsi jawaban per siswa</label>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-success" id="btn-simpan">Simpan</button>
        <button class="btn btn-secondary" id="btn-batal">Batal</button>
      </div>
    </div>
  `;

  if (isEdit) {
    app.querySelector('#f-judul').value = ulanganData.judul;
    app.querySelector('#f-deskripsi').value = ulanganData.deskripsi || '';
    app.querySelector('#f-mapel').value = ulanganData.mapel_id;
    app.querySelector('#f-kelas').value = ulanganData.kelas_id;
    app.querySelector('#f-durasi').value = ulanganData.durasi_menit;
    app.querySelector('#f-jumlah').value = ulanganData.jumlah_soal;
    app.querySelector('#f-mulai').value = toLocalInputValue(ulanganData.waktu_mulai);
    app.querySelector('#f-selesai').value = toLocalInputValue(ulanganData.waktu_selesai);
    app.querySelector('#f-passing').value = ulanganData.passing_grade || '';
    app.querySelector('#f-acak-soal').checked = !!ulanganData.acak_soal;
    app.querySelector('#f-acak-jawaban').checked = !!ulanganData.acak_jawaban;
  }

  app.querySelector('#btn-batal').onclick = () => navigate('/guru/ulangan');
  app.querySelector('#btn-simpan').onclick = async () => {
    const body = {
      judul: app.querySelector('#f-judul').value.trim(),
      deskripsi: app.querySelector('#f-deskripsi').value.trim(),
      mapel_id: app.querySelector('#f-mapel').value,
      kelas_id: app.querySelector('#f-kelas').value,
      durasi_menit: parseInt(app.querySelector('#f-durasi').value, 10),
      jumlah_soal: parseInt(app.querySelector('#f-jumlah').value, 10),
      waktu_mulai: app.querySelector('#f-mulai').value,
      waktu_selesai: app.querySelector('#f-selesai').value,
      passing_grade: app.querySelector('#f-passing').value ? parseFloat(app.querySelector('#f-passing').value) : null,
      acak_soal: app.querySelector('#f-acak-soal').checked,
      acak_jawaban: app.querySelector('#f-acak-jawaban').checked,
    };
    if (!body.judul || !body.waktu_mulai || !body.waktu_selesai) return toast('Lengkapi field wajib', 'error');
    try {
      let id = params.id;
      if (isEdit) await api.put(`/api/ulangan/${id}`, body);
      else {
        const res = await api.post('/api/ulangan', body);
        id = res.id;
      }
      toast('Ulangan disimpan', 'success');
      navigate(`/guru/ulangan/${id}/soal`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}

/** Halaman atur pool soal untuk sebuah ulangan */
export async function renderUlanganSoal(params) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const ulangan = await api.get(`/api/ulangan/${params.id}`);
  const soalMapel = await api.get(`/api/soal?mapel_id=${ulangan.mapel_id}`);
  const terpilihIds = new Set(ulangan.soal.map((s) => s.soal_id));

  app.innerHTML = `
    <h2>Atur Soal — ${escapeHtml(ulangan.judul)}</h2>
    <div class="card">
      <p style="font-size:.85rem;color:var(--text-muted)">
        Pilih pool soal (minimal ${ulangan.jumlah_soal} soal). Sistem akan mengacak
        ${ulangan.jumlah_soal} soal dari pool ini untuk setiap siswa.
      </p>
      <div id="counter" style="font-weight:700;margin-bottom:8px"></div>
      <div id="soal-checklist" style="max-height:50vh;overflow-y:auto"></div>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-success" id="btn-simpan">Simpan Pool Soal</button>
        <button class="btn btn-secondary" id="btn-kembali">Kembali</button>
      </div>
    </div>
  `;

  const checklist = app.querySelector('#soal-checklist');
  if (soalMapel.length === 0) {
    checklist.innerHTML = `<div class="empty-state">Belum ada soal untuk mapel ini. <a href="#/guru/soal/baru">Tambah soal</a></div>`;
  }
  checklist.innerHTML += soalMapel
    .map(
      (s) => `
    <label class="flex gap-8" style="align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" class="chk-soal" value="${s.id}" ${terpilihIds.has(s.id) ? 'checked' : ''} style="margin-top:4px" />
      <span style="font-size:.88rem">${escapeHtml(s.pertanyaan).slice(0, 120)}</span>
    </label>
  `
    )
    .join('');

  function updateCounter() {
    const jumlah = checklist.querySelectorAll('.chk-soal:checked').length;
    app.querySelector('#counter').textContent = `${jumlah} soal dipilih (butuh minimal ${ulangan.jumlah_soal})`;
  }
  checklist.querySelectorAll('.chk-soal').forEach((c) => (c.onchange = updateCounter));
  updateCounter();

  app.querySelector('#btn-kembali').onclick = () => navigate('/guru/ulangan');
  app.querySelector('#btn-simpan').onclick = async () => {
    const ids = [...checklist.querySelectorAll('.chk-soal:checked')].map((c) => parseInt(c.value, 10));
    try {
      await api.put(`/api/ulangan/${params.id}/soal`, { soal_ids: ids });
      toast('Pool soal disimpan', 'success');
      navigate('/guru/ulangan');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}
