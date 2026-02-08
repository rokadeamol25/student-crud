import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const tenantId = auth.tenantId;

  const { data: rows, error } = await supabase
    .from('invoices')
    .select('status, total')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch invoice summary' });
  }

  const draft = { count: 0, total: 0 };
  const sent = { count: 0, total: 0 };
  const paid = { count: 0, total: 0 };
  for (const r of rows || []) {
    const t = Number(r.total || 0);
    if (r.status === 'draft') {
      draft.count += 1;
      draft.total += t;
    } else if (r.status === 'sent') {
      sent.count += 1;
      sent.total += t;
    } else if (r.status === 'paid') {
      paid.count += 1;
      paid.total += t;
    }
  }
  draft.total = Math.round(draft.total * 100) / 100;
  sent.total = Math.round(sent.total * 100) / 100;
  paid.total = Math.round(paid.total * 100) / 100;

  return res.status(200).json({
    draft,
    sent,
    paid,
  });
}
