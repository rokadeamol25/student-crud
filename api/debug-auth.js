/**
 * GET /api/debug-auth — diagnostic only. Call with Authorization: Bearer <token>.
 * Returns { ok, code }: code is 'ok' | 'token_missing' | 'token_invalid' | 'user_not_found'.
 * Use from browser console after login: fetch('/api/debug-auth', { headers: { Authorization: 'Bearer ' + token } }).then(r=>r.json()).then(console.log)
 */
import { requireAuthWithReason } from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { auth, failCode } = await requireAuthWithReason(req);
  return res.status(200).json({ ok: Boolean(auth), code: failCode || 'ok' });
}
