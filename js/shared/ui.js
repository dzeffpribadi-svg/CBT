export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function confirmDialog(message) {
  return window.confirm(message);
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function badgeStatus(status) {
  const map = {
    draft: ['Draft', 'gray'],
    published: ['Aktif', 'green'],
    closed: ['Ditutup', 'red'],
    belum_dibuka: ['Belum Dibuka', 'gray'],
    bisa_dikerjakan: ['Bisa Dikerjakan', 'green'],
    sedang_berlangsung: ['Sedang Dikerjakan', 'yellow'],
    sudah_selesai: ['Selesai', 'blue'],
    sudah_ditutup: ['Ditutup', 'red'],
    berlangsung: ['Berlangsung', 'yellow'],
    selesai: ['Selesai', 'blue'],
    timeout: ['Waktu Habis', 'red'],
  };
  const [label, color] = map[status] || [status, 'gray'];
  return `<span class="badge badge-${color}">${label}</span>`;
}
