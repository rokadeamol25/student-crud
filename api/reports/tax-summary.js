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

  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_date')
    .eq('tenant_id', tenantId)
    .in('status', ['sent', 'paid'])
    .gte('invoice_date', from)
    .lte('invoice_date', to);
  if (invErr) {
    console.error(invErr);
    return res.status(500).json({ error: 'Failed to fetch tax summary' });
  }
  const invoiceIds = (invoices || []).map((i) => i.id);
  if (invoiceIds.length === 0) {
    return res.status(200).json({
      period: { from, to },
      byMonth: [],
      totals: { cgst: 0, sgst: 0, igst: 0, totalTax: 0 },
      invoiceCount: 0,
    });
  }

  const { data: items, error: itemsErr } = await supabase
    .from('invoice_items')
    .select('invoice_id, cgst_amount, sgst_amount, igst_amount')
    .in('invoice_id', invoiceIds);
  if (itemsErr) {
    console.error(itemsErr);
    return res.status(500).json({ error: 'Failed to fetch tax details' });
  }
  const invByDate = Object.fromEntries((invoices || []).map((i) => [i.id, i.invoice_date]));
  const byMonth = {};
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;
  for (const row of items || []) {
    const date = invByDate[row.invoice_id];
    if (!date) continue;
    const month = String(date).slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { month, cgst: 0, sgst: 0, igst: 0 };
    const cgst = Number(row.cgst_amount) || 0;
    const sgst = Number(row.sgst_amount) || 0;
    const igst = Number(row.igst_amount) || 0;
    byMonth[month].cgst += cgst;
    byMonth[month].sgst += sgst;
    byMonth[month].igst += igst;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
  }
  const byMonthList = Object.values(byMonth)
    .map((r) => ({
      month: r.month,
      cgst: Math.round(r.cgst * 100) / 100,
      sgst: Math.round(r.sgst * 100) / 100,
      igst: Math.round(r.igst * 100) / 100,
      totalTax: Math.round((r.cgst + r.sgst + r.igst) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return res.status(200).json({
    period: { from, to },
    byMonth: byMonthList,
    totals: {
      cgst: Math.round(totalCgst * 100) / 100,
      sgst: Math.round(totalSgst * 100) / 100,
      igst: Math.round(totalIgst * 100) / 100,
      totalTax: Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100,
    },
    invoiceCount: invoices.length,
  });
}
