import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

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
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Customer id required' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const tenantId = auth.tenantId;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
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
      if (body.email !== undefined) {
        updates.email = (body.email ?? '').toString().trim().slice(0, 255) || null;
      }
      if (body.phone !== undefined) {
        updates.phone = (body.phone ?? '').toString().trim().slice(0, 50) || null;
      }
      if (body.address !== undefined) {
        updates.address = (body.address ?? '').toString().trim().slice(0, 1000) || null;
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to update customer' });
      }
      if (!data) return res.status(404).json({ error: 'Customer not found' });
      return res.json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Customers [id] handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
