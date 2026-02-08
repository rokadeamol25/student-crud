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

  let invQuery = supabase
    .from('invoices')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid');
  if (from) invQuery = invQuery.gte('invoice_date', from);
  if (to) invQuery = invQuery.lte('invoice_date', to);
  const { data: paidInvoices, error: invErr } = await invQuery;
  if (invErr) {
    console.error(invErr);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
  const invoiceIds = (paidInvoices || []).map((i) => i.id);
  if (invoiceIds.length === 0) {
    return res.status(200).json({ data: [], from: from || null, to: to || null });
  }

  const { data: items, error: itemsErr } = await supabase
    .from('invoice_items')
    .select('product_id, description, quantity, amount')
    .in('invoice_id', invoiceIds);

  if (itemsErr) {
    console.error(itemsErr);
    return res.status(500).json({ error: 'Failed to fetch items' });
  }

  const byProduct = {};
  for (const row of items || []) {
    const key = row.product_id || `adhoc:${(row.description || '').slice(0, 50)}`;
    if (!byProduct[key]) byProduct[key] = { productId: row.product_id, description: row.description || '—', quantity: 0, revenue: 0 };
    byProduct[key].quantity += Number(row.quantity) || 0;
    byProduct[key].revenue += Number(row.amount) || 0;
  }

  const productIds = [...new Set(Object.keys(byProduct).filter((k) => k.startsWith('adhoc') === false))];
  let products = [];
  if (productIds.length > 0) {
    const { data: prods } = await supabase.from('products').select('id, name').eq('tenant_id', tenantId).in('id', productIds);
    products = prods || [];
  }
  const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

  const data = Object.entries(byProduct).map(([key, v]) => ({
    productId: v.productId,
    productName: v.productId ? (nameMap[v.productId] || v.description) : (v.description || 'Ad-hoc'),
    quantity: Math.round(v.quantity * 100) / 100,
    revenue: Math.round(v.revenue * 100) / 100,
  }));
  data.sort((a, b) => b.revenue - a.revenue);

  return res.status(200).json({ data, from: from || null, to: to || null });
}
