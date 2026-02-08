import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const tenantId = auth.tenantId;

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = (body.name ?? '').toString().trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (name.length > 500) return res.status(400).json({ error: 'name too long' });
    const email = (body.email ?? '').toString().trim().slice(0, 255) || null;
    const phone = (body.phone ?? '').toString().trim().slice(0, 50) || null;
    const address = (body.address ?? '').toString().trim().slice(0, 1000) || null;
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ tenant_id: tenantId, name, email, phone, address })
      .select()
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to create supplier' });
    }
    return res.status(201).json(data);
  }

  if (req.method === 'GET') {
    let q = supabase.from('suppliers').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('name');
    const search = (req.query?.q ?? '').toString().trim();
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 100);
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to list suppliers' });
    }
    return res.json({ data: data || [], total: count ?? data?.length ?? 0 });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
