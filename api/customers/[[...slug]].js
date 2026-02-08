/**
 * Consolidated /api/customers and /api/customers/[id] — one serverless function.
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
        const { data, error } = await supabase.from('customers').select('*').eq('id', id).eq('tenant_id', tenantId).single();
        if (error || !data) return res.status(404).json({ error: 'Customer not found' });
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
        if (body.email !== undefined) updates.email = (body.email ?? '').toString().trim().slice(0, 255) || null;
        if (body.phone !== undefined) updates.phone = (body.phone ?? '').toString().trim().slice(0, 50) || null;
        if (body.address !== undefined) updates.address = (body.address ?? '').toString().trim().slice(0, 1000) || null;
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
        const { data, error } = await supabase.from('customers').update(updates).eq('id', id).eq('tenant_id', tenantId).select().single();
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to update customer' });
        }
        if (!data) return res.status(404).json({ error: 'Customer not found' });
        return res.json(data);
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = (body.name ?? '').toString().trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (name.length > 500) return res.status(400).json({ error: 'name too long' });
      const email = (body.email ?? '').toString().trim().slice(0, 255) || null;
      const phone = (body.phone ?? '').toString().trim().slice(0, 50) || null;
      const address = (body.address ?? '').toString().trim().slice(0, 1000) || null;
      const { data, error } = await supabase.from('customers').insert({ tenant_id: tenantId, name, email, phone, address }).select().single();
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to create customer' });
      }
      return res.status(201).json(data);
    }

    if (req.method === 'GET') {
      let q = supabase.from('customers').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('name');
      const search = (req.query?.q ?? '').toString().trim();
      if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 100);
      const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
      q = q.range(offset, offset + limit - 1);
      const { data, error, count } = await q;
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to list customers' });
      }
      return res.json({ data: data || [], total: count ?? data?.length ?? 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Customers handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
