import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

function getDefaultMonth() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const tenantId = auth.tenantId;
  let from = (req.query?.from ?? '').toString().trim();
  let to = (req.query?.to ?? '').toString().trim();
  if (!from || !to) {
    const def = getDefaultMonth();
    from = from || def.from;
    to = to || def.to;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid from or to date' });
  }

  const { data: rows, error } = await supabase
    .from('invoices')
    .select('subtotal, tax_amount')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid')
    .gte('invoice_date', from)
    .lte('invoice_date', to);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch tax summary' });
  }

  let subtotal = 0;
  let taxAmount = 0;
  for (const r of rows || []) {
    subtotal += Number(r.subtotal ?? r.total ?? 0);
    taxAmount += Number(r.tax_amount ?? 0);
  }

  return res.status(200).json({
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    invoiceCount: (rows || []).length,
    from,
    to,
  });
}
