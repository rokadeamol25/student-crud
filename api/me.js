import { supabase } from './_lib/supabase.js';
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const { data: user } = await supabase.from('users').select('id, email, tenant_id').eq('id', auth.userId).single();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { data: tenant } = await supabase.from('tenants').select('id, name, slug').eq('id', auth.tenantId).single();
  return res.json({ user: { id: user.id, email: user.email }, tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null });
}
