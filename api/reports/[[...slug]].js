/**
 * Consolidated /api/reports/* — one serverless function. Dispatches by slug[0] to lib handlers.
 */
import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';
import * as reportHandlers from '../../lib/api-report-handlers.js';

function getSlug(req) {
  const slug = req.query?.slug;
  if (Array.isArray(slug)) return slug;
  if (slug != null) return [slug];
  return [];
}

const HANDLERS = {
  'sales-summary': reportHandlers.salesSummary,
  'invoice-summary': reportHandlers.invoiceSummary,
  outstanding: reportHandlers.outstanding,
  'top-products': reportHandlers.topProducts,
  'top-customers': reportHandlers.topCustomers,
  'tax-summary': reportHandlers.taxSummary,
  'revenue-trend': reportHandlers.revenueTrend,
  'product-profit': reportHandlers.productProfit,
  pnl: reportHandlers.pnl,
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const slug = getSlug(req);
  const name = slug[0];
  if (!name || !HANDLERS[name]) return res.status(404).json({ error: 'Report not found' });

  try {
    return await HANDLERS[name](supabase, auth.tenantId, req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
