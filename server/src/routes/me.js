/**
 * GET /api/me — current user and tenant.
 * PATCH /api/me — update tenant name (body: { name }).
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

router.get('/', async (req, res, next) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, email, tenant_id')
      .eq('id', req.userId)
      .single();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug')
      .eq('id', req.tenantId)
      .single();
    return res.json({
      user: { id: user.id, email: user.email },
      tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const name = (req.body?.name ?? '').toString().trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (name.length > 500) return res.status(400).json({ error: 'name too long' });
    const { data: tenant, error } = await supabase
      .from('tenants')
      .update({ name })
      .eq('id', req.tenantId)
      .select('id, name, slug')
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to update shop name' });
    }
    const { data: user } = await supabase
      .from('users')
      .select('id, email, tenant_id')
      .eq('id', req.userId)
      .single();
    return res.json({
      user: user ? { id: user.id, email: user.email } : null,
      tenant: tenant || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
