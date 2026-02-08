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
    const price = Number(body.price);
    if (price === undefined || Number.isNaN(price) || price < 0) return res.status(400).json({ error: 'price is required and must be >= 0' });
    const unit = (body.unit ?? '').toString().trim().slice(0, 50) || null;
    const hsnSacCode = (body.hsn_sac_code ?? body.hsnSacCode ?? '').toString().trim().slice(0, 20) || null;
    const taxPercent = body.tax_percent !== undefined && body.tax_percent !== null
      ? (Number(body.tax_percent) >= 0 && Number(body.tax_percent) <= 100 ? Number(body.tax_percent) : null)
      : null;
    const { data, error } = await supabase.from('products').insert({
      tenant_id: tenantId,
      name,
      price,
      unit,
      hsn_sac_code: hsnSacCode,
      tax_percent: taxPercent,
    }).select().single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to create product' });
    }
    return res.status(201).json(data);
  }

  if (req.method === 'GET') {
    let q = supabase.from('products').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('name');
    const search = (req.query?.q ?? '').toString().trim();
    if (search) q = q.ilike('name', `%${search}%`);
    const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 100);
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to list products' });
    }
    return res.json({ data: data || [], total: count ?? data?.length ?? 0 });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
