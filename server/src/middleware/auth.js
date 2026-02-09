/**
 * Auth middleware: verify Supabase JWT, resolve tenant_id from users table.
 * NEVER trust tenant_id from client. Attach req.authId and req.tenantId for routes.
 */
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const RETRYABLE_NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];
const AUTH_RETRIES = 2;
const AUTH_RETRY_DELAY_MS = 500;

function isRetryableNetworkError(e) {
  const code = e?.code ?? e?.cause?.code ?? (e?.cause?.errno === -54 ? 'ECONNRESET' : '');
  return RETRYABLE_NETWORK_CODES.includes(code) || (e?.message && String(e.message).includes('fetch failed'));
}

async function getUserWithRetry(token) {
  let lastErr;
  for (let attempt = 0; attempt <= AUTH_RETRIES; attempt++) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return { error: error?.message || 'Invalid or expired token', user: null };
      return { error: null, user };
    } catch (e) {
      lastErr = e;
      if (attempt < AUTH_RETRIES && isRetryableNetworkError(e)) {
        await new Promise((r) => setTimeout(r, AUTH_RETRY_DELAY_MS));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

/**
 * Verify Supabase JWT and resolve user's tenant_id. Sets req.authId, req.tenantId, req.userId.
 * Returns 401 if no/invalid token; 403 if token valid but no user row (not onboarded).
 */
export async function authMiddleware(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  let payload;
  try {
    if (jwtSecret) {
      try {
        payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      } catch (_) {
        const { error, user } = await getUserWithRetry(token);
        if (error || !user) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        payload = { sub: user.id, email: user.email };
      }
    } else {
      const { error, user } = await getUserWithRetry(token);
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      payload = { sub: user.id, email: user.email };
    }
  } catch (e) {
    return res.status(401).json({ error: e.message || 'Invalid or expired token' });
  }

  const authId = payload.sub;
  if (!authId) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  const { data: userRow, error } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_id', authId)
    .single();

  if (error || !userRow) {
    return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  }

  req.authId = authId;
  req.tenantId = userRow.tenant_id;
  req.userId = userRow.id;
  next();
}

/**
 * Optional: same as authMiddleware but does not require user row (for signup/complete).
 * Use when we need to know auth_id but tenant may not exist yet.
 */
export async function optionalAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization' });
  }
  let payload;
  try {
    if (jwtSecret) {
      payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    } else {
      const { error, user } = await getUserWithRetry(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });
      payload = { sub: user.id, email: user.email };
    }
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.authId = payload.sub;
  req.authEmail = payload.email || '';
  next();
}
