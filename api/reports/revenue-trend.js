import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const tenantId = auth.tenantId;
  const months = Math.min(24, Math.max(1, parseInt(req.query?.months, 10) || 6));

  const { data: rows, error } = await supabase
    .from('invoices')
    .select('invoice_date, total')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid');

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch revenue trend' });
  }

  const byMonth = {};
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = { month: key, revenue: 0 };
  }

  for (const r of rows || []) {
    const d = new Date(r.invoice_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (byMonth[key]) byMonth[key].revenue += Number(r.total || 0);
  }

  const data = Object.values(byMonth)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((v) => ({ ...v, revenue: Math.round(v.revenue * 100) / 100 }));

  return res.status(200).json({ data, months });
}
