/**
 * POST /api/signup/complete
 * Body: { shopName, email? }
 * Creates tenant + user linked to JWT (auth_id). Call once after Supabase signUp.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const router = Router();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'shop';
}

function makeSlugUnique(baseSlug) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${baseSlug}-${suffix}`;
}

router.post('/complete', async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization' });
    }
    let payload;
    try {
      if (jwtSecret) {
        try {
          payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
        } catch (_) {
          const { data: { user }, error } = await supabase.auth.getUser(token);
          if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
          payload = { sub: user.id, email: user.email };
        }
      } else {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
        payload = { sub: user.id, email: user.email };
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const authId = payload.sub;
    const email = (payload.email || req.body?.email || '').toString().trim() || null;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const shopName = (req.body?.shopName || req.body?.shop_name || '').toString().trim();
    if (!shopName) {
      return res.status(400).json({ error: 'shopName is required' });
    }
    if (shopName.length > 200) {
      return res.status(400).json({ error: 'shopName too long' });
    }

    const { data: existing } = await supabase.from('users').select('id').eq('auth_id', authId).single();
    if (existing) {
      return res.status(400).json({ error: 'Already onboarded. Use login.' });
    }

    let slug = slugify(shopName);
    const { data: slugTaken } = await supabase.from('tenants').select('id').eq('slug', slug).single();
    if (slugTaken) slug = makeSlugUnique(slug);

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({ name: shopName, slug })
      .select('id, name, slug')
      .single();
    if (tenantErr) {
      console.error(tenantErr);
      return res.status(500).json({ error: 'Failed to create tenant' });
    }

    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({
        auth_id: authId,
        tenant_id: tenant.id,
        email,
        role: 'owner',
      })
      .select('id, email')
      .single();
    if (userErr) {
      console.error(userErr);
      await supabase.from('tenants').delete().eq('id', tenant.id);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    return res.status(201).json({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
