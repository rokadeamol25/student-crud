/**
 * Consolidated /api/purchase-bills, /api/purchase-bills/[id], /api/purchase-bills/[id]/record,
 * /api/purchase-bills/[id]/payments, /api/purchase-bills/[id]/payments/[paymentId].
 * slug: [] = list/create, [id] = get/patch/delete, [id,'record'] = POST record, [id,'payments'] = POST, [id,'payments',paymentId] = DELETE.
 */
import { requireAuth } from '../_lib/auth.js';

function getSlug(req) {
  const slug = req.query?.slug;
  if (Array.isArray(slug)) return slug;
  if (slug != null) return [slug];
  return [];
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const slug = getSlug(req);
  const id = slug[0];
  const sub = slug[1];
  const paymentId = slug[2];

  req.query = req.query || {};
  req.query.id = id;
  req.query.paymentId = paymentId;

  try {
    if (slug.length === 0) {
      const mod = await import('../../lib/purchase-bills/listCreate.js');
      return mod.default(req, res);
    }
    if (slug.length === 1) {
      const mod = await import('../../lib/purchase-bills/getUpdateDelete.js');
      return mod.default(req, res);
    }
    if (slug.length === 2 && sub === 'record') {
      const mod = await import('../../lib/purchase-bills/record.js');
      return mod.default(req, res);
    }
    if (slug.length === 2 && sub === 'payments') {
      const mod = await import('../../lib/purchase-bills/paymentsPost.js');
      return mod.default(req, res);
    }
    if (slug.length === 3 && sub === 'payments') {
      const mod = await import('../../lib/purchase-bills/paymentDelete.js');
      return mod.default(req, res);
    }
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Purchase bills handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
