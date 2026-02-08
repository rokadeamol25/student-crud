import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const tenantId = auth.tenantId;

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, customer_id, total')
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .order('invoice_date', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch outstanding' });
  }

  const list = invoices || [];
  const customerIds = [...new Set(list.map((i) => i.customer_id).filter(Boolean))];
  let customers = [];
  if (customerIds.length > 0) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', customerIds);
    customers = cust || [];
  }
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));

  const totalDue = list.reduce((sum, i) => sum + Number(i.total || 0), 0);

  const result = list.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    customer_name: custMap[inv.customer_id] || '—',
    total: Number(inv.total),
  }));

  return res.status(200).json({
    totalDue: Math.round(totalDue * 100) / 100,
    invoices: result,
  });
}
