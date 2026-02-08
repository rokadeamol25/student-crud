/**
 * Customers API: all queries filtered by req.tenantId.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function validateCreate(body) {
  const name = (body?.name ?? '').toString().trim();
  if (!name) return { error: 'name is required' };
  if (name.length > 500) return { error: 'name too long' };
  const email = (body?.email ?? '').toString().trim().slice(0, 255) || null;
  const phone = (body?.phone ?? '').toString().trim().slice(0, 50) || null;
  const address = (body?.address ?? '').toString().trim().slice(0, 1000) || null;
  return { name, email, phone, address };
}

router.post('/', async (req, res, next) => {
  try {
    const validated = validateCreate(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    const { data, error } = await supabase
      .from('customers')
      .insert({
        tenant_id: req.tenantId,
        name: validated.name,
        email: validated.email,
        phone: validated.phone,
        address: validated.address,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to create customer' });
    }
    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('name');
    const search = (req.query?.q ?? '').toString().trim();
    if (search) {
      q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data, error } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to list customers' });
    }
    return res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Customer not found' });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
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
    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to update customer' });
    }
    if (!data) return res.status(404).json({ error: 'Customer not found' });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
