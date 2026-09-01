import { api } from '../shared/api.js';
import { toast, confirmDialog, escapeHtml } from '../shared/ui.js';
import { navigate } from '../shared/router.js';
import { getUser } from '../shared/store.js';

/** Mapel yang boleh dipilih guru saat ini (admin = semua mapel). */
function filterMapelUntukUser(mapelList) {
  const user = getUser();
  if (user.role === 'admin' || !user.profil?.mapel_ids) return mapelList;
  const allowed = new Set(user.profil.mapel_ids);
  return mapelList.filter((m) => allowed.has(m.id));
}

export async function renderSoalList(params, query) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const mapelList = await api.get('/api/mapel');
  const mapelPilihan = filterMapelUntukUser(mapelList);
  const mapelFilter = query.mapel_id || '';
  const soalList = await api.get(`/api/soal${mapelFilter ? `?mapel_id=${mapelFilter}` : ''}`);

  const tipeLabel = { pilihan_ganda: 'Pilihan Ganda', benar_salah: 'Benar/Salah', isian: 'Isian' };

  app.innerHTML = `
    <div class="flex-between mb-0">
      <h2>Bank Soal</h2>
      <button class="btn btn-sm" id="btn-tambah">+ Tambah Soal</button>
    </div>
    <div class="card">
      <div class="form-group mb-0">
        <label>Filter Mapel</label>
        <select id="f-filter-mapel">
          <option value="">Semua Mapel</option>
          ${mapelPilihan.map((m) => `<option value="${m.id}" ${String(m.id) === mapelFilter ? 'selected' : ''}>${escapeHtml(m.nama_mapel)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="list"></div>
    ${soalList.length === 0 ? '<div class="empty-state">Belum ada soal</div>' : ''}
  `;

  app.querySelector('#f-filter-mapel').onchange = (e) => {
    navigate(`/guru/soal${e.target.value ? `?mapel_id=${e.target.value}` : ''}`);
  };

  const list = app.querySelector('#list');
  list.innerHTML = soalList
    .map(
      (s) => `
    <div class="card">
      <div class="flex-between">
        <span class="badge badge-blue">${tipeLabel[s.tipe_soal]}</span>
        <span style="font-size:.75rem;color:var(--text-muted)">${escapeHtml(s.nama_mapel)} · Bobot ${s.bobot_nilai}</span>
      </div>
      <p style="margin:8px 0">${escapeHtml(s.pertanyaan).slice(0, 160)}${s.pertanyaan.length > 160 ? '…' : ''}</p>
      ${s.gambar_url ? `<img src="${s.gambar_url}" style="max-width:120px;border-radius:6px;margin-bottom:8px" />` : ''}
      <div class="flex gap-8">
        <button class="btn btn-outline btn-sm" data-edit="${s.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-hapus="${s.id}">Hapus</button>
      </div>
    </div>
  `
    )
    .join('');

  app.querySelector('#btn-tambah').onclick = () => navigate('/guru/soal/baru');
  list.querySelectorAll('[data-edit]').forEach((btn) => (btn.onclick = () => navigate(`/guru/soal/${btn.dataset.edit}/edit`)));
  list.querySelectorAll('[data-hapus]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirmDialog('Hapus soal ini?')) return;
      try {
        const res = await api.del(`/api/soal/${btn.dataset.hapus}`);
        toast(res.message, 'success');
        renderSoalList(params, query);
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });
}

export async function renderSoalForm(params) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div>`;
  const isEdit = !!params.id;
  const [mapelListRaw, soalData] = await Promise.all([
    api.get('/api/mapel'),
    isEdit ? api.get(`/api/soal/${params.id}`) : Promise.resolve(null),
  ]);
  let mapelList = filterMapelUntukUser(mapelListRaw);
  // Saat edit, pastikan mapel soal yang sedang diedit tetap tampil di dropdown
  // walau penugasan guru untuk mapel itu sudah dicabut admin (agar tidak salah pindah mapel tanpa sengaja).
  if (isEdit && soalData && !mapelList.some((m) => m.id === soalData.mapel_id)) {
    const mapelAsli = mapelListRaw.find((m) => m.id === soalData.mapel_id);
    if (mapelAsli) mapelList = [mapelAsli, ...mapelList];
  }

  if (mapelList.length === 0) {
    app.innerHTML = `<div class="card"><p>Anda belum ditugaskan mengampu mata pelajaran apa pun. Hubungi admin untuk penugasan mapel terlebih dahulu.</p><button class="btn mt-8" id="btn-kembali">Kembali</button></div>`;
    app.querySelector('#btn-kembali').onclick = () => navigate('/guru/soal');
    return;
  }

  app.innerHTML = `
    <h2>${isEdit ? 'Edit Soal' : 'Tambah Soal'}</h2>
    <div class="card">
      <div class="form-group">
        <label>Mata Pelajaran</label>
        <select id="f-mapel">${mapelList.map((m) => `<option value="${m.id}">${escapeHtml(m.nama_mapel)}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label>Tipe Soal</label>
        <select id="f-tipe">
          <option value="pilihan_ganda">Pilihan Ganda</option>
          <option value="benar_salah">Benar / Salah</option>
          <option value="isian">Isian Singkat</option>
        </select>
      </div>
      <div class="form-group">
        <label>Pertanyaan</label>
        <textarea id="f-pertanyaan" placeholder="Tulis pertanyaan..."></textarea>
      </div>
      <div class="form-group">
        <label>Gambar Soal (opsional)</label>
        <input type="file" id="f-gambar-file" accept="image/*" />
        <input type="hidden" id="f-gambar-url" />
        <img id="preview-gambar" style="max-width:160px;border-radius:8px;margin-top:8px;display:none" />
      </div>
      <div class="form-group">
        <label>Bobot Nilai</label>
        <input type="number" id="f-bobot" value="1" min="0.1" step="0.1" />
      </div>
      <div class="form-group">
        <label>Level Kesulitan</label>
        <select id="f-level">
          <option value="mudah">Mudah</option>
          <option value="sedang" selected>Sedang</option>
          <option value="sulit">Sulit</option>
        </select>
      </div>

      <div id="area-pg" class="form-group">
        <label>Opsi Jawaban (tandai satu sebagai jawaban benar)</label>
        <div id="opsi-list"></div>
        <button type="button" class="btn btn-outline btn-sm mt-8" id="btn-tambah-opsi">+ Tambah Opsi</button>
      </div>

      <div id="area-bs" class="form-group hidden">
        <label>Kunci Jawaban</label>
        <select id="f-kunci-bs"><option value="benar">Benar</option><option value="salah">Salah</option></select>
      </div>

      <div id="area-isian" class="form-group hidden">
        <label>Kunci Jawaban (teks, pencocokan tidak case-sensitive)</label>
        <input type="text" id="f-kunci-isian" />
      </div>

      <div class="flex gap-8">
        <button class="btn btn-success" id="btn-simpan">Simpan Soal</button>
        <button class="btn btn-secondary" id="btn-batal">Batal</button>
      </div>
    </div>
  `;

  const opsiListEl = app.querySelector('#opsi-list');
  function addOpsiRow(teks = '', benar = false) {
    const row = document.createElement('div');
    row.className = 'flex gap-8 mt-8';
    row.style.alignItems = 'center';
    row.innerHTML = `
      <input type="radio" name="opsi-benar" ${benar ? 'checked' : ''} style="width:20px;height:20px" />
      <input type="text" class="opsi-teks" placeholder="Teks opsi" value="${escapeHtml(teks)}" style="flex:1" />
      <button type="button" class="btn btn-danger btn-sm btn-hapus-opsi">✕</button>
    `;
    row.querySelector('.btn-hapus-opsi').onclick = () => row.remove();
    opsiListEl.appendChild(row);
  }
  app.querySelector('#btn-tambah-opsi').onclick = () => addOpsiRow();

  function toggleAreaByTipe(tipe) {
    app.querySelector('#area-pg').classList.toggle('hidden', tipe !== 'pilihan_ganda');
    app.querySelector('#area-bs').classList.toggle('hidden', tipe !== 'benar_salah');
    app.querySelector('#area-isian').classList.toggle('hidden', tipe !== 'isian');
  }
  app.querySelector('#f-tipe').onchange = (e) => toggleAreaByTipe(e.target.value);

  // Upload gambar -> base64 -> /api/upload
  app.querySelector('#f-gambar-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        toast('Mengunggah gambar...');
        const res = await api.post('/api/upload', {
          filename: file.name,
          content_type: file.type,
          data_base64: reader.result,
        });
        app.querySelector('#f-gambar-url').value = res.url;
        const preview = app.querySelector('#preview-gambar');
        preview.src = res.url;
        preview.style.display = 'block';
        toast('Gambar berhasil diunggah', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  if (isEdit) {
    app.querySelector('#f-mapel').value = soalData.mapel_id;
    app.querySelector('#f-tipe').value = soalData.tipe_soal;
    app.querySelector('#f-pertanyaan').value = soalData.pertanyaan;
    app.querySelector('#f-bobot').value = soalData.bobot_nilai;
    app.querySelector('#f-level').value = soalData.level_kesulitan;
    if (soalData.gambar_url) {
      app.querySelector('#f-gambar-url').value = soalData.gambar_url;
      const preview = app.querySelector('#preview-gambar');
      preview.src = soalData.gambar_url;
      preview.style.display = 'block';
    }
    if (soalData.tipe_soal === 'pilihan_ganda') {
      soalData.opsi.forEach((o) => addOpsiRow(o.teks_opsi, !!o.is_benar));
    } else if (soalData.tipe_soal === 'benar_salah') {
      app.querySelector('#f-kunci-bs').value = soalData.kunci_jawaban;
    } else if (soalData.tipe_soal === 'isian') {
      app.querySelector('#f-kunci-isian').value = soalData.kunci_jawaban;
    }
    toggleAreaByTipe(soalData.tipe_soal);
  } else {
    addOpsiRow();
    addOpsiRow();
    toggleAreaByTipe('pilihan_ganda');
  }

  app.querySelector('#btn-batal').onclick = () => navigate('/guru/soal');

  app.querySelector('#btn-simpan').onclick = async () => {
    const tipe_soal = app.querySelector('#f-tipe').value;
    const body = {
      mapel_id: app.querySelector('#f-mapel').value,
      tipe_soal,
      pertanyaan: app.querySelector('#f-pertanyaan').value.trim(),
      gambar_url: app.querySelector('#f-gambar-url').value || null,
      bobot_nilai: parseFloat(app.querySelector('#f-bobot').value) || 1,
      level_kesulitan: app.querySelector('#f-level').value,
    };
    if (!body.pertanyaan) return toast('Pertanyaan wajib diisi', 'error');

    if (tipe_soal === 'pilihan_ganda') {
      const rows = [...opsiListEl.querySelectorAll('.flex')];
      body.opsi = rows.map((row) => ({
        teks_opsi: row.querySelector('.opsi-teks').value.trim(),
        is_benar: row.querySelector('input[type=radio]').checked,
      }));
      if (body.opsi.some((o) => !o.teks_opsi)) return toast('Semua opsi harus diisi', 'error');
    } else if (tipe_soal === 'benar_salah') {
      body.kunci_jawaban = app.querySelector('#f-kunci-bs').value;
    } else {
      body.kunci_jawaban = app.querySelector('#f-kunci-isian').value.trim();
      if (!body.kunci_jawaban) return toast('Kunci jawaban isian wajib diisi', 'error');
    }

    try {
      if (isEdit) await api.put(`/api/soal/${params.id}`, body);
      else await api.post('/api/soal', body);
      toast('Soal disimpan', 'success');
      navigate('/guru/soal');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
}
