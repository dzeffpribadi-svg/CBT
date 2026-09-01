import { api, ApiRequestError } from '../shared/api.js';
import { toast, confirmDialog, formatDuration, escapeHtml } from '../shared/ui.js';
import { navigate } from '../shared/router.js';
import { enqueueAnswer, flushQueue, countQueued } from '../shared/offline-queue.js';

let state = null; // state ujian aktif saat ini
let timerInterval = null;
let syncInterval = null;
let submitted = false;

function tokenKey(ulanganId) {
  return `cbt_attempt_token_${ulanganId}`;
}

async function ensureToken(ulanganId) {
  const key = tokenKey(ulanganId);
  let token = localStorage.getItem(key);
  if (token) return token;
  const res = await api.post(`/api/siswa/ulangan/${ulanganId}/mulai`);
  localStorage.setItem(key, res.token_sesi);
  return res.token_sesi;
}

export async function renderUjian(params) {
  cleanup();
  const app = document.getElementById('app');
  app.innerHTML = `<div class="spinner"></div><p class="text-center" style="color:var(--text-muted)">Menyiapkan ujian...</p>`;
  const ulanganId = params.id;

  let token;
  try {
    token = await ensureToken(ulanganId);
  } catch (e) {
    app.innerHTML = `<div class="card"><p>${escapeHtml(e.message)}</p><button class="btn mt-8" id="btn-kembali">Kembali</button></div>`;
    app.querySelector('#btn-kembali').onclick = () => navigate('/siswa/ulangan');
    return;
  }

  let data;
  try {
    data = await api.get(`/api/siswa/attempt/${token}/soal`);
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      // token stale, coba ulang buat sesi baru
      localStorage.removeItem(tokenKey(ulanganId));
      try {
        token = await ensureToken(ulanganId);
        data = await api.get(`/api/siswa/attempt/${token}/soal`);
      } catch (e2) {
        toast(e2.message, 'error');
        navigate('/siswa/ulangan');
        return;
      }
    } else {
      toast(e.message, 'error');
      navigate('/siswa/ulangan');
      return;
    }
  }

  if (data.attempt.status !== 'berlangsung') {
    showHasilSelesai(data.attempt);
    return;
  }

  const jawabanMap = new Map(data.jawaban.map((j) => [j.soal_id, j]));
  state = {
    ulanganId,
    token,
    soal: data.soal,
    jawaban: jawabanMap,
    currentIndex: 0,
    sisaDetik: data.attempt.sisa_detik,
    pendingCount: 0,
  };

  renderExamShell();
  startTimer();
  startBackgroundSync();
  window.addEventListener('online', onOnline);
}

function cleanup() {
  if (timerInterval) clearInterval(timerInterval);
  if (syncInterval) clearInterval(syncInterval);
  window.removeEventListener('online', onOnline);
  submitted = false;
}

async function onOnline() {
  if (!state) return;
  await syncPending();
}

function startTimer() {
  timerInterval = setInterval(() => {
    if (!state) return;
    state.sisaDetik = Math.max(0, state.sisaDetik - 1);
    updateTimerDisplay();
    if (state.sisaDetik <= 0 && !submitted) {
      submitted = true;
      toast('Waktu habis! Ujian akan disubmit otomatis.', 'error');
      doSubmit(true);
    }
  }, 1000);
}

function startBackgroundSync() {
  syncInterval = setInterval(async () => {
    if (!state) return;
    await syncPending();
    // sinkronisasi ulang sisa waktu dari server untuk koreksi drift
    try {
      const status = await api.get(`/api/siswa/attempt/${state.token}/status`);
      if (status.status !== 'berlangsung' && !submitted) {
        submitted = true;
        showHasilSelesai({ ...status, id: null });
      } else {
        state.sisaDetik = status.sisa_detik;
      }
    } catch (e) {
      // offline, diamkan - timer client tetap jalan
    }
  }, 15000);
}

async function syncPending() {
  if (!state) return;
  const jumlah = await countQueued(state.token);
  if (jumlah === 0) return;
  updateSyncIndicator('pending', jumlah);
  await flushQueue(state.token, async (payload) => {
    await api.post(`/api/siswa/attempt/${state.token}/jawab`, payload);
  }).catch(() => null);
  const sisa = await countQueued(state.token);
  updateSyncIndicator(sisa === 0 ? 'ok' : 'pending', sisa);
}

function updateSyncIndicator(mode, count) {
  const dot = document.querySelector('.sync-dot');
  const label = document.querySelector('#sync-label');
  if (!dot || !label) return;
  dot.className = `sync-dot ${mode === 'ok' ? '' : mode}`;
  label.textContent =
    mode === 'ok' ? 'Tersimpan' : mode === 'pending' ? `${count} jawaban menunggu sinkron` : 'Offline';
}

function updateTimerDisplay() {
  const el = document.querySelector('#exam-timer');
  if (!el) return;
  el.textContent = formatDuration(state.sisaDetik);
  el.classList.toggle('warning', state.sisaDetik <= 60);
}

function renderExamShell() {
  const app = document.getElementById('app');
  app.className = ''; // lepas padding container default saat ujian
  app.innerHTML = `
    <div class="exam-header">
      <div>
        <div style="font-size:.75rem;color:var(--text-muted)">Sisa Waktu</div>
        <div class="exam-timer" id="exam-timer">${formatDuration(state.sisaDetik)}</div>
      </div>
      <div class="sync-indicator">
        <span class="sync-dot"></span>
        <span id="sync-label">Tersimpan</span>
      </div>
    </div>
    <div class="soal-nav-grid" id="nav-grid"></div>
    <div id="soal-container"></div>
    <div class="exam-footer">
      <button class="btn btn-outline" id="btn-prev">‹ Sebelumnya</button>
      <button class="btn" id="btn-next">Selanjutnya ›</button>
      <button class="btn btn-success hidden" id="btn-submit">Selesai &amp; Submit</button>
    </div>
  `;
  renderNavGrid();
  renderCurrentSoal();

  document.getElementById('btn-prev').onclick = () => {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderCurrentSoal();
      renderNavGrid();
    }
  };
  document.getElementById('btn-next').onclick = () => {
    if (state.currentIndex < state.soal.length - 1) {
      state.currentIndex++;
      renderCurrentSoal();
      renderNavGrid();
    }
  };
  document.getElementById('btn-submit').onclick = () => {
    if (!confirmDialog('Yakin ingin menyelesaikan dan submit ujian? Jawaban tidak dapat diubah lagi setelah ini.')) return;
    submitted = true;
    doSubmit(false);
  };
}

function renderNavGrid() {
  const grid = document.getElementById('nav-grid');
  if (!grid) return;
  grid.innerHTML = state.soal
    .map((s, idx) => {
      const j = state.jawaban.get(s.id);
      const answered = j && (j.opsi_id || (j.jawaban_teks && j.jawaban_teks.trim()));
      const flagged = j && j.ditandai;
      const classes = ['soal-nav-item'];
      if (answered) classes.push('answered');
      if (flagged) classes.push('flagged');
      if (idx === state.currentIndex) classes.push('current');
      return `<button class="${classes.join(' ')}" data-idx="${idx}">${idx + 1}</button>`;
    })
    .join('');
  grid.querySelectorAll('[data-idx]').forEach((btn) => {
    btn.onclick = () => {
      state.currentIndex = parseInt(btn.dataset.idx, 10);
      renderCurrentSoal();
      renderNavGrid();
    };
  });
}

function renderCurrentSoal() {
  const soal = state.soal[state.currentIndex];
  const jawaban = state.jawaban.get(soal.id) || {};
  const container = document.getElementById('soal-container');

  let opsiHtml = '';
  if (soal.tipe_soal === 'pilihan_ganda') {
    const huruf = 'ABCDEFGHIJ';
    opsiHtml = `<div class="opsi-list">${soal.opsi
      .map(
        (o, i) => `
      <label class="opsi-item ${jawaban.opsi_id === o.id ? 'selected' : ''}" data-opsi="${o.id}">
        <input type="radio" name="opsi" ${jawaban.opsi_id === o.id ? 'checked' : ''} />
        <span class="opsi-label">${huruf[i]}.</span>
        <span>${escapeHtml(o.teks_opsi)}</span>
      </label>
    `
      )
      .join('')}</div>`;
  } else if (soal.tipe_soal === 'benar_salah') {
    opsiHtml = `<div class="opsi-list">
      ${['benar', 'salah']
        .map(
          (v) => `
        <label class="opsi-item ${jawaban.jawaban_teks === v ? 'selected' : ''}" data-bs="${v}">
          <input type="radio" name="bs" ${jawaban.jawaban_teks === v ? 'checked' : ''} />
          <span>${v === 'benar' ? 'Benar' : 'Salah'}</span>
        </label>
      `
        )
        .join('')}
    </div>`;
  } else {
    opsiHtml = `<textarea id="isian-jawaban" placeholder="Tulis jawaban Anda...">${escapeHtml(jawaban.jawaban_teks || '')}</textarea>`;
  }

  container.innerHTML = `
    <div class="soal-body">
      <div class="flex-between">
        <div class="soal-nomor">Soal ${state.currentIndex + 1} dari ${state.soal.length}</div>
        <label style="font-size:.8rem;display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="chk-tandai" ${jawaban.ditandai ? 'checked' : ''} /> Ragu-ragu
        </label>
      </div>
      <div class="soal-pertanyaan">${escapeHtml(soal.pertanyaan)}</div>
      ${soal.gambar_url ? `<img class="soal-gambar" src="${soal.gambar_url}" />` : ''}
      ${opsiHtml}
    </div>
  `;

  document.getElementById('btn-prev').disabled = state.currentIndex === 0;
  const isLast = state.currentIndex === state.soal.length - 1;
  document.getElementById('btn-next').classList.toggle('hidden', isLast);
  document.getElementById('btn-submit').classList.toggle('hidden', !isLast);

  if (soal.tipe_soal === 'pilihan_ganda') {
    container.querySelectorAll('[data-opsi]').forEach((label) => {
      label.onclick = () => simpanJawaban(soal.id, { opsi_id: parseInt(label.dataset.opsi, 10) });
    });
  } else if (soal.tipe_soal === 'benar_salah') {
    container.querySelectorAll('[data-bs]').forEach((label) => {
      label.onclick = () => simpanJawaban(soal.id, { jawaban_teks: label.dataset.bs });
    });
  } else {
    let debounceTimer;
    container.querySelector('#isian-jawaban').oninput = (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => simpanJawaban(soal.id, { jawaban_teks: e.target.value }), 500);
    };
  }

  document.getElementById('chk-tandai').onchange = (e) => {
    simpanJawaban(soal.id, { ditandai: e.target.checked });
  };
}

async function simpanJawaban(soalId, partialPayload) {
  const existing = state.jawaban.get(soalId) || {};
  const merged = { ...existing, ...partialPayload };
  state.jawaban.set(soalId, merged);
  renderNavGrid(); // update indikator terjawab langsung di UI

  const payload = { soal_id: soalId, ...partialPayload };
  try {
    await api.post(`/api/siswa/attempt/${state.token}/jawab`, payload);
    updateSyncIndicator('ok');
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 0) {
      await enqueueAnswer(state.token, payload);
      const jumlah = await countQueued(state.token);
      updateSyncIndicator('pending', jumlah);
      toast('Offline — jawaban disimpan di perangkat, akan disinkron otomatis', 'info');
    } else if (e.status === 409) {
      toast(e.message, 'error');
    } else {
      toast('Gagal menyimpan jawaban: ' + e.message, 'error');
    }
  }
}

async function doSubmit(isTimeout) {
  cleanup();
  try {
    await syncPending();
  } catch (e) {
    // lanjutkan submit walau sinkronisasi terakhir gagal - server akan hitung dari data yang berhasil tersimpan
  }
  try {
    const res = await api.post(`/api/siswa/attempt/${state.token}/submit`);
    localStorage.removeItem(tokenKey(state.ulanganId));
    showHasilSelesai({
      status: isTimeout ? 'timeout' : 'selesai',
      nilai: res.nilai,
      jumlah_benar: res.jumlah_benar,
      total_soal: res.total_soal,
    });
  } catch (e) {
    toast(e.message, 'error');
    navigate('/siswa/ulangan');
  }
}

function showHasilSelesai(attempt) {
  cleanup();
  const app = document.getElementById('app');
  app.className = 'container';
  app.innerHTML = `
    <div class="card text-center" style="padding:32px 16px">
      <div style="font-size:2.4rem">${attempt.status === 'timeout' ? '⏰' : '✅'}</div>
      <h2>${attempt.status === 'timeout' ? 'Waktu Habis' : 'Ujian Selesai'}</h2>
      <p style="color:var(--text-muted)">Jawaban Anda telah tersimpan dan dinilai otomatis.</p>
      ${attempt.nilai !== undefined && attempt.nilai !== null ? `<div style="font-size:2.4rem;font-weight:800;margin:14px 0">${attempt.nilai}</div>` : ''}
      <button class="btn mt-8" id="btn-kembali">Kembali ke Daftar Ulangan</button>
    </div>
  `;
  document.getElementById('btn-kembali').onclick = () => navigate('/siswa/ulangan');
}
