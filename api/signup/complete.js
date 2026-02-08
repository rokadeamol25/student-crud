import { supabase } from '../_lib/supabase.js';
import { verifyTokenOnly } from '../_lib/auth.js';

function slugify(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'shop';
}
function makeSlugUnique(baseSlug) {
  return `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const payload = await verifyTokenOnly(req);
  if (!payload) {
    return res.status(401).json({ error: 'Missing or invalid Authorization' });
  }
  const authId = payload.authId;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const email = (payload.email || body.email || '').toString().trim() || null;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const shopName = (body.shopName || body.shop_name || '').toString().trim();
  if (!shopName) return res.status(400).json({ error: 'shopName is required' });
  if (shopName.length > 200) return res.status(400).json({ error: 'shopName too long' });

  const { data: existing } = await supabase.from('users').select('id').eq('auth_id', authId).single();
  if (existing) return res.status(400).json({ error: 'Already onboarded. Use login.' });

  let slug = slugify(shopName);
  const { data: slugTaken } = await supabase.from('tenants').select('id').eq('slug', slug).single();
  if (slugTaken) slug = makeSlugUnique(slug);

  const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert({ name: shopName, slug }).select('id, name, slug').single();
  if (tenantErr) {
    console.error(tenantErr);
    return res.status(500).json({ error: 'Failed to create tenant' });
  }
  const { data: user, error: userErr } = await supabase.from('users').insert({ auth_id: authId, tenant_id: tenant.id, email }).select('id, email').single();
  if (userErr) {
    console.error(userErr);
    await supabase.from('tenants').delete().eq('id', tenant.id);
    return res.status(500).json({ error: 'Failed to create user' });
  }
  return res.status(201).json({ tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, user: { id: user.id, email: user.email } });
}
