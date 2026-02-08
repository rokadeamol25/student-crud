/**
 * GET /api/me
 * Returns current user and tenant (for UI). Requires auth middleware.
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

export default router;
