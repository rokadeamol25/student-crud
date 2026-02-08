/**
 * Consolidated /api/products and /api/products/[id] — one serverless function.
 */
import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

function getSlug(req) {
  const slug = req.query?.slug;
  if (Array.isArray(slug)) return slug;
  if (slug != null) return [slug];
  return [];
}

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
  const tenantId = auth.tenantId;
  const slug = getSlug(req);
  const id = slug.length === 1 ? slug[0] : null;

  try {
    if (id) {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('products').select('*').eq('id', id).eq('tenant_id', tenantId).single();
        if (error || !data) return res.status(404).json({ error: 'Product not found' });
        return res.json(data);
      }
      if (req.method === 'PATCH') {
        const body = parseBody(req);
        const updates = {};
        if (body.name !== undefined) {
          const name = (body.name ?? '').toString().trim();
          if (!name) return res.status(400).json({ error: 'name is required' });
          if (name.length > 500) return res.status(400).json({ error: 'name too long' });
          updates.name = name;
        }
        if (body.price !== undefined) {
          const price = Number(body.price);
          if (Number.isNaN(price) || price < 0) return res.status(400).json({ error: 'price must be >= 0' });
          updates.price = price;
        }
        if (body.unit !== undefined) updates.unit = (body.unit ?? '').toString().trim().slice(0, 50) || null;
        if (body.hsn_sac_code !== undefined || body.hsnSacCode !== undefined) {
          updates.hsn_sac_code = (body.hsn_sac_code ?? body.hsnSacCode ?? '').toString().trim().slice(0, 20) || null;
        }
        if (body.tax_percent !== undefined) {
          const p = Number(body.tax_percent);
          updates.tax_percent = (Number.isNaN(p) || p < 0 || p > 100) ? null : p;
        }
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
        const { data, error } = await supabase.from('products').update(updates).eq('id', id).eq('tenant_id', tenantId).select().single();
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to update product' });
        }
        if (!data) return res.status(404).json({ error: 'Product not found' });
        return res.json(data);
      }
      if (req.method === 'DELETE') {
        const { data: used } = await supabase.from('invoice_items').select('id').eq('product_id', id).limit(1);
        if (used && used.length > 0) {
          return res.status(409).json({ error: 'Cannot delete: product is used in invoices' });
        }
        const { error } = await supabase.from('products').delete().eq('id', id).eq('tenant_id', tenantId);
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to delete product' });
        }
        return res.status(204).end();
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

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
  } catch (err) {
    console.error('Products handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
