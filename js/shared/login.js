import { api } from './api.js';
import { saveSession } from './store.js';
import { toast } from './ui.js';
import { navigate } from './router.js';

export function renderLogin() {
  const app = document.getElementById('app');
  document.getElementById('topbar-mount').innerHTML = '';
  document.getElementById('tabbar-mount').innerHTML = '';
  app.className = '';
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>CBT Ulangan Harian</h1>
        <p class="subtitle">Masuk untuk melanjutkan</p>
        <div class="form-group">
          <label>Username</label>
          <input type="text" id="f-username" autocomplete="username" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="f-password" autocomplete="current-password" />
        </div>
        <button class="btn btn-block" id="btn-login">Masuk</button>
        <p id="err" style="color:var(--danger);font-size:.82rem;text-align:center;margin-top:12px"></p>
      </div>
    </div>
  `;

  const doLogin = async () => {
    const username = app.querySelector('#f-username').value.trim();
    const password = app.querySelector('#f-password').value;
    const errEl = app.querySelector('#err');
    errEl.textContent = '';
    if (!username || !password) {
      errEl.textContent = 'Username dan password wajib diisi';
      return;
    }
    const btn = app.querySelector('#btn-login');
    btn.disabled = true;
    btn.textContent = 'Memproses...';
    try {
      const res = await api.post('/api/auth/login', { username, password });
      saveSession(res.token, res.user);
      toast(`Selamat datang, ${res.user.nama_lengkap}`, 'success');
      navigate('/');
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  };

  app.querySelector('#btn-login').onclick = doLogin;
  app.querySelector('#f-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}
