/**
 * Products API: all queries filtered by req.tenantId (never from client).
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function validateCreate(body) {
  const name = (body?.name ?? '').toString().trim();
  if (!name) return { error: 'name is required' };
  if (name.length > 500) return { error: 'name too long' };
  const price = Number(body?.price);
  if (price === undefined || price === null || Number.isNaN(price) || price < 0) {
    return { error: 'price is required and must be >= 0' };
  }
  const unit = (body?.unit ?? '').toString().trim().slice(0, 50) || null;
  return { name, price, unit };
}

router.post('/', async (req, res, next) => {
  try {
    const validated = validateCreate(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    const { data, error } = await supabase
      .from('products')
      .insert({
        tenant_id: req.tenantId,
        name: validated.name,
        price: validated.price,
        unit: validated.unit,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to create product' });
    }
    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('name');
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
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Product not found' });
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
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (Number.isNaN(price) || price < 0) return res.status(400).json({ error: 'price must be >= 0' });
      updates.price = price;
    }
    if (body.unit !== undefined) {
      updates.unit = (body.unit ?? '').toString().trim().slice(0, 50) || null;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to update product' });
    }
    if (!data) return res.status(404).json({ error: 'Product not found' });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: used } = await supabase.from('invoice_items').select('id').eq('product_id', id).limit(1);
    if (used && used.length > 0) {
      return res.status(409).json({ error: 'Cannot delete: product is used in invoices' });
    }
    const { error } = await supabase.from('products').delete().eq('id', id).eq('tenant_id', req.tenantId);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to delete product' });
    }
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
