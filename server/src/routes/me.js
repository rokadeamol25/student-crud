/**
 * GET /api/me — current user and tenant (incl. currency, gstin, tax_percent).
 * PATCH /api/me — update tenant (name, currency, currency_symbol, gstin, tax_percent).
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tenantFields = 'id, name, slug, currency, currency_symbol, gstin, tax_percent';

router.get('/', async (req, res, next) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, email, tenant_id')
      .eq('id', req.userId)
      .single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { data: tenant } = await supabase
      .from('tenants')
      .select(tenantFields)
      .eq('id', req.tenantId)
      .single();
    return res.json({
      user: { id: user.id, email: user.email },
      tenant: tenant ? { ...tenant, currency: tenant.currency || 'INR', tax_percent: tenant.tax_percent != null ? Number(tenant.tax_percent) : 0 } : null,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const body = req.body || {};
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
      .eq('id', req.tenantId)
      .select(tenantFields)
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to update settings' });
    }
    const { data: user } = await supabase.from('users').select('id, email, tenant_id').eq('id', req.userId).single();
    return res.json({ user: user ? { id: user.id, email: user.email } : null, tenant: tenant || null });
  } catch (err) {
    next(err);
  }
});

export default router;
