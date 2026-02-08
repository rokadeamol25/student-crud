import { supabase } from './_lib/supabase.js';
import { requireAuth } from './_lib/auth.js';

function parseBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    const name = (body.name ?? '').toString().trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (name.length > 500) return res.status(400).json({ error: 'name too long' });
    const { data: tenant, error } = await supabase
      .from('tenants')
      .update({ name })
      .eq('id', auth.tenantId)
      .select('id, name, slug')
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to update shop name' });
    }
    const { data: user } = await supabase.from('users').select('id, email, tenant_id').eq('id', auth.userId).single();
    return res.json({ user: user ? { id: user.id, email: user.email } : null, tenant: tenant || null });
  }

  if (req.method === 'GET') {
    const { data: user } = await supabase.from('users').select('id, email, tenant_id').eq('id', auth.userId).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { data: tenant } = await supabase.from('tenants').select('id, name, slug').eq('id', auth.tenantId).single();
    return res.json({ user: { id: user.id, email: user.email }, tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
