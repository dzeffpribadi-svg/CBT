// Jika frontend di-hosting terpisah dari Worker (misal GitHub Pages / Cloudflare Pages
// terpisah dari Worker API), isi API_BASE_URL dengan URL worker, contoh:
// export const API_BASE_URL = 'https://cbt-ulangan-harian.namamu.workers.dev';
//
// Jika frontend disajikan langsung oleh Worker yang sama (via [assets] di wrangler.toml,
// seperti pada setup default proyek ini), biarkan string kosong (same-origin, tanpa CORS).
export const API_BASE_URL = '';
