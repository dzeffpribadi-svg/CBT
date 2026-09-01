// =====================================================================
// Antrean offline berbasis IndexedDB.
// Saat POST jawaban gagal karena koneksi terputus, jawaban disimpan di sini
// dan otomatis disinkronkan ulang ketika koneksi pulih (event 'online' + polling ringan).
// =====================================================================

const DB_NAME = 'cbt-offline-db';
const STORE = 'pending_jawaban';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('token', 'token', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Simpan jawaban ke antrean lokal (dipanggil saat fetch ke server gagal). */
export async function enqueueAnswer(token, payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ token, payload, ts: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Ambil semua item antrean untuk token attempt tertentu, urut waktu. */
export async function getQueuedAnswers(token) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('token');
    const req = idx.getAll(IDBKeyRange.only(token));
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.ts - b.ts));
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countQueued(token) {
  const items = await getQueuedAnswers(token);
  return items.length;
}

/**
 * Coba sinkronkan semua jawaban tertunda untuk sebuah attempt ke server.
 * postFn: async (payload) => harus melempar error jika gagal (mis. offline / server error).
 * Mengirim SECARA BERURUTAN agar jawaban terbaru untuk soal yang sama tidak salah urutan.
 * Berhenti begitu ada kegagalan (kemungkinan masih offline) dan sisanya tetap di antrean.
 */
export async function flushQueue(token, postFn, onProgress) {
  const items = await getQueuedAnswers(token);
  let synced = 0;
  for (const item of items) {
    try {
      await postFn(item.payload);
      await removeQueuedItem(item.id);
      synced++;
      if (onProgress) onProgress(synced, items.length);
    } catch (e) {
      // Berhenti di kegagalan pertama - urutan harus tetap terjaga
      return { synced, total: items.length, done: false };
    }
  }
  return { synced, total: items.length, done: true };
}
