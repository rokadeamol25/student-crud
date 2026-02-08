import jwt from 'jsonwebtoken';
import { supabase } from './supabase.js';

const jwtSecret = process.env.SUPABASE_JWT_SECRET;

export function getBearerToken(req) {
  const auth = req.headers?.authorization;
  if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

/** Verify JWT and return { authId, email }. Supports HS256 (legacy) and ECC via getUser. */
export async function verifyToken(token) {
  if (!token) return null;
  if (jwtSecret) {
    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      return { authId: payload.sub, email: payload.email };
    } catch (_) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return null;
      return { authId: user.id, email: user.email };
    }
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { authId: user.id, email: user.email };
}

/** Verify token and load user row. Returns { authId, tenantId, userId } or null. */
export async function requireAuth(req) {
  const token = getBearerToken(req);
  const payload = await verifyToken(token);
  if (!payload) return null;
  const { data: row, error } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_id', payload.authId)
    .single();
  if (error || !row) return null;
  return { authId: payload.authId, tenantId: row.tenant_id, userId: row.id };
}

/** For signup/complete: verify token only (no user row required). Returns { authId, email } or null. */
export async function verifyTokenOnly(req) {
  const token = getBearerToken(req);
  return verifyToken(token);
}
