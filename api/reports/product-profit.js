import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

function getDefaultMonth() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
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
  if (new Date(from) > new Date(to)) return res.status(400).json({ error: 'from must be before or equal to to' });

  try {
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('status', ['sent', 'paid'])
      .gte('invoice_date', from)
      .lte('invoice_date', to);
    if (invErr) {
      console.error(invErr);
      return res.status(500).json({ error: 'Failed to fetch product profit' });
    }
    const invoiceIds = (invoices || []).map((i) => i.id);
    if (invoiceIds.length === 0) {
      return res.json({ data: [], from, to });
    }
    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('product_id, description, quantity, amount, cost_amount')
      .in('invoice_id', invoiceIds);
    if (itemsErr) {
      console.error(itemsErr);
      return res.status(500).json({ error: 'Failed to fetch invoice items' });
    }
    const byProduct = {};
    for (const row of items || []) {
      const key = row.product_id || `adhoc:${(row.description || '').slice(0, 50)}`;
      if (!byProduct[key]) byProduct[key] = { product_id: row.product_id, description: row.description || '—', quantity: 0, sales: 0, cost: 0 };
      byProduct[key].quantity += Number(row.quantity) || 0;
      byProduct[key].sales += Number(row.amount) || 0;
      byProduct[key].cost += Number(row.cost_amount) || 0;
    }
    const productIds = Object.keys(byProduct).filter((k) => !k.startsWith('adhoc'));
    let products = [];
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from('products').select('id, name').eq('tenant_id', tenantId).in('id', productIds);
      products = prods || [];
    }
    const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
    const data = Object.entries(byProduct).map(([, v]) => {
      const sales = Math.round(v.sales * 100) / 100;
      const cost = Math.round(v.cost * 100) / 100;
      const profit = Math.round((sales - cost) * 100) / 100;
      return {
        product_id: v.product_id,
        product_name: v.product_id ? (nameMap[v.product_id] || v.description) : (v.description || 'Ad-hoc'),
        quantity_sold: Math.round(v.quantity * 100) / 100,
        sales,
        cost,
        profit,
      };
    });
    data.sort((a, b) => b.profit - a.profit);
    return res.json({ data, from, to });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
