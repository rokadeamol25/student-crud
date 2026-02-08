/**
 * API client: all tenant-scoped requests go to Express backend with JWT.
 * Base URL from env. Token from Supabase session (injected by caller).
 */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function api(token, path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    ...options,
    headers,
    body: options.body !== undefined ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(res.ok ? text : `Request failed: ${res.status} ${text}`);
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText || String(res.status);
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function get(token, path) {
  return api(token, path, { method: 'GET' });
}
export function post(token, path, body) {
  return api(token, path, { method: 'POST', body });
}
export function put(token, path, body) {
  return api(token, path, { method: 'PUT', body });
}
export function del(token, path) {
  return api(token, path, { method: 'DELETE' });
}
