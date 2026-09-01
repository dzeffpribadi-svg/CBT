import { API_BASE_URL } from './config.js';
import { getToken, clearSession } from './store.js';

export class ApiRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiRequestError('OFFLINE', 0);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (e) {
    // no body
  }

  if (response.status === 401) {
    clearSession();
    if (!path.includes('/auth/login')) {
      window.location.hash = '#/login';
    }
  }

  if (!response.ok) {
    throw new ApiRequestError(payload?.error || `Terjadi kesalahan (${response.status})`, response.status);
  }
  return payload?.data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};
