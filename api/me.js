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

  const tenantFields = 'id, name, slug, currency, currency_symbol, gstin, tax_percent';

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    const updates = {};
    if (body.name !== undefined) {
      const name = (body.name ?? '').toString().trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (name.length > 500) return res.status(400).json({ error: 'name too long' });
      updates.name = name;
    }
    if (body.currency !== undefined) updates.currency = (body.currency ?? 'INR').toString().trim().slice(0, 10) || 'INR';
    if (body.currency_symbol !== undefined) updates.currency_symbol = (body.currency_symbol ?? '').toString().trim().slice(0, 10) || null;
    if (body.gstin !== undefined) updates.gstin = (body.gstin ?? '').toString().trim().slice(0, 50) || null;
    if (body.tax_percent !== undefined) {
      const p = Number(body.tax_percent);
      if (Number.isNaN(p) || p < 0 || p > 100) return res.status(400).json({ error: 'tax_percent must be 0–100' });
      updates.tax_percent = p;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data: tenant, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', auth.tenantId)
      .select(tenantFields)
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to update settings' });
    }
    const { data: user } = await supabase.from('users').select('id, email, tenant_id').eq('id', auth.userId).single();
    return res.json({ user: user ? { id: user.id, email: user.email } : null, tenant: tenant || null });
  }

  if (req.method === 'GET') {
    const { data: user } = await supabase.from('users').select('id, email, tenant_id').eq('id', auth.userId).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { data: tenant } = await supabase.from('tenants').select(tenantFields).eq('id', auth.tenantId).single();
    return res.json({
      user: { id: user.id, email: user.email },
      tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug, currency: tenant.currency || 'INR', currency_symbol: tenant.currency_symbol, gstin: tenant.gstin, tax_percent: tenant.tax_percent != null ? Number(tenant.tax_percent) : 0 } : null,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
