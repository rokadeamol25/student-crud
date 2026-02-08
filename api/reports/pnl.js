import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

function getDefaultMonth() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function parseRange(query) {
  let from = (query?.from ?? '').toString().trim();
  let to = (query?.to ?? '').toString().trim();
  const month = (query?.month ?? '').toString().trim();
  const fy = (query?.fy ?? '').toString().trim();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    from = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0);
    to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  } else if (fy && /^\d{4}-\d{4}$/.test(fy)) {
    const startYear = parseInt(fy.slice(0, 4), 10);
    from = `${startYear}-04-01`;
    to = `${startYear + 1}-03-31`;
  }
  if (!from || !to) {
    const def = getDefaultMonth();
    from = from || def.from;
    to = to || def.to;
  }
  return { from, to };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const tenantId = auth.tenantId;
  const { from, to } = parseRange(req.query);
  if (new Date(from) > new Date(to)) return res.status(400).json({ error: 'from must be before or equal to to' });

  try {
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, total')
      .eq('tenant_id', tenantId)
      .in('status', ['sent', 'paid'])
      .gte('invoice_date', from)
      .lte('invoice_date', to);
    if (invErr) {
      console.error(invErr);
      return res.status(500).json({ error: 'Failed to fetch P&L' });
    }
    const totalSales = (invoices || []).reduce((s, i) => s + Number(i.total || 0), 0);
    const invoiceIds = (invoices || []).map((i) => i.id);
    let totalCost = 0;
    if (invoiceIds.length > 0) {
      const { data: items, error: itemsErr } = await supabase
        .from('invoice_items')
        .select('cost_amount')
        .in('invoice_id', invoiceIds);
      if (!itemsErr) totalCost = (items || []).reduce((s, r) => s + Number(r.cost_amount || 0), 0);
    }
    const { data: purchaseBills, error: pbErr } = await supabase
      .from('purchase_bills')
      .select('total')
      .eq('tenant_id', tenantId)
      .eq('status', 'recorded')
      .gte('bill_date', from)
      .lte('bill_date', to);
    if (pbErr) {
      console.error(pbErr);
      return res.status(500).json({ error: 'Failed to fetch purchases' });
    }
    const totalPurchases = (purchaseBills || []).reduce((s, b) => s + Number(b.total || 0), 0);
    const totalSalesR = Math.round(totalSales * 100) / 100;
    const totalCostR = Math.round(totalCost * 100) / 100;
    const totalPurchasesR = Math.round(totalPurchases * 100) / 100;
    const grossProfit = Math.round((totalSalesR - totalCostR) * 100) / 100;
    const profitPercent = totalSalesR > 0 ? Math.round(grossProfit / totalSalesR * 10000) / 100 : 0;
    return res.json({
      from,
      to,
      totalSales: totalSalesR,
      totalPurchases: totalPurchasesR,
      totalCost: totalCostR,
      grossProfit,
      profitPercent,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
