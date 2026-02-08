import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const tenantId = auth.tenantId;
  const from = (req.query?.from ?? '').toString().trim();
  const to = (req.query?.to ?? '').toString().trim();

  let q = supabase
    .from('invoices')
    .select('customer_id, total')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid');
  if (from) q = q.gte('invoice_date', from);
  if (to) q = q.lte('invoice_date', to);
  const { data: rows, error } = await q;

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }

  const byCustomer = {};
  for (const r of rows || []) {
    const cid = r.customer_id;
    if (!cid) continue;
    if (!byCustomer[cid]) byCustomer[cid] = { invoiceCount: 0, totalPaid: 0 };
    byCustomer[cid].invoiceCount += 1;
    byCustomer[cid].totalPaid += Number(r.total || 0);
  }

  const customerIds = Object.keys(byCustomer);
  if (customerIds.length === 0) {
    return res.status(200).json({ data: [], from: from || null, to: to || null });
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', customerIds);
  const nameMap = Object.fromEntries((customers || []).map((c) => [c.id, c.name]));

  const data = customerIds.map((customerId) => ({
    customerId,
    customerName: nameMap[customerId] || '—',
    invoiceCount: byCustomer[customerId].invoiceCount,
    totalPaid: Math.round(byCustomer[customerId].totalPaid * 100) / 100,
  }));
  data.sort((a, b) => b.totalPaid - a.totalPaid);

  return res.status(200).json({ data, from: from || null, to: to || null });
}
