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
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('name');
    const search = (req.query?.q ?? '').toString().trim();
    if (search) {
      q = q.ilike('name', `%${search}%`);
    }
    const { data, error } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to list products' });
    }
    return res.json(data || []);
  } catch (err) {
    next(err);
  }
});

export default router;
