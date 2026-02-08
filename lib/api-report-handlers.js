/**
 * Report handlers for /api/reports/[name]. Called from api/reports/[[...slug]].js.
 * Each receives (supabase, tenantId, req, res).
 */

function getDefaultMonth() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function parsePnLRange(query) {
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

export async function salesSummary(supabase, tenantId, req, res) {
  let from = (req.query?.from ?? '').toString().trim();
  let to = (req.query?.to ?? '').toString().trim();
  if (!from || !to) {
    const def = getDefaultMonth();
    from = from || def.from;
    to = to || def.to;
  }
  if (new Date(from) > new Date(to)) return res.status(400).json({ error: 'from must be before or equal to to' });
  const { data: rows, error } = await supabase.from('invoices').select('total').eq('tenant_id', tenantId).eq('status', 'paid').gte('invoice_date', from).lte('invoice_date', to);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
  const totalRevenue = (rows || []).reduce((sum, r) => sum + Number(r.total || 0), 0);
  return res.status(200).json({ totalRevenue: Math.round(totalRevenue * 100) / 100, invoiceCount: (rows || []).length, from, to });
}

export async function invoiceSummary(supabase, tenantId, req, res) {
  const { data: rows, error } = await supabase.from('invoices').select('status, total').eq('tenant_id', tenantId);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch invoice summary' });
  }
  const draft = { count: 0, total: 0 };
  const sent = { count: 0, total: 0 };
  const paid = { count: 0, total: 0 };
  for (const r of rows || []) {
    const t = Number(r.total || 0);
    if (r.status === 'draft') { draft.count += 1; draft.total += t; }
    else if (r.status === 'sent') { sent.count += 1; sent.total += t; }
    else if (r.status === 'paid') { paid.count += 1; paid.total += t; }
  }
  draft.total = Math.round(draft.total * 100) / 100;
  sent.total = Math.round(sent.total * 100) / 100;
  paid.total = Math.round(paid.total * 100) / 100;
  return res.status(200).json({ draft, sent, paid });
}

export async function outstanding(supabase, tenantId, req, res) {
  const { data: invoices, error } = await supabase.from('invoices').select('id, invoice_number, invoice_date, customer_id, total').eq('tenant_id', tenantId).eq('status', 'sent').order('invoice_date', { ascending: false });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch outstanding' });
  }
  const list = invoices || [];
  const customerIds = [...new Set(list.map((i) => i.customer_id).filter(Boolean))];
  let customers = [];
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('id, name').eq('tenant_id', tenantId).in('id', customerIds);
    customers = cust || [];
  }
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  const totalDue = list.reduce((sum, i) => sum + Number(i.total || 0), 0);
  return res.status(200).json({
    totalDue: Math.round(totalDue * 100) / 100,
    invoices: list.map((inv) => ({ id: inv.id, invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, customer_name: custMap[inv.customer_id] || '—', total: Number(inv.total) })),
  });
}

export async function topProducts(supabase, tenantId, req, res) {
  const from = (req.query?.from ?? '').toString().trim();
  const to = (req.query?.to ?? '').toString().trim();
  let invQuery = supabase.from('invoices').select('id').eq('tenant_id', tenantId).eq('status', 'paid');
  if (from) invQuery = invQuery.gte('invoice_date', from);
  if (to) invQuery = invQuery.lte('invoice_date', to);
  const { data: paidInvoices, error: invErr } = await invQuery;
  if (invErr) return res.status(500).json({ error: 'Failed to fetch invoices' });
  const invoiceIds = (paidInvoices || []).map((i) => i.id);
  if (invoiceIds.length === 0) return res.status(200).json({ data: [], from: from || null, to: to || null });
  const { data: items, error: itemsErr } = await supabase.from('invoice_items').select('product_id, description, quantity, amount').in('invoice_id', invoiceIds);
  if (itemsErr) return res.status(500).json({ error: 'Failed to fetch items' });
  const byProduct = {};
  for (const row of items || []) {
    const key = row.product_id || `adhoc:${(row.description || '').slice(0, 50)}`;
    if (!byProduct[key]) byProduct[key] = { productId: row.product_id, description: row.description || '—', quantity: 0, revenue: 0 };
    byProduct[key].quantity += Number(row.quantity) || 0;
    byProduct[key].revenue += Number(row.amount) || 0;
  }
  const productIds = Object.keys(byProduct).filter((k) => !k.startsWith('adhoc'));
  let products = [];
  if (productIds.length > 0) {
    const { data: prods } = await supabase.from('products').select('id, name').eq('tenant_id', tenantId).in('id', productIds);
    products = prods || [];
  }
  const nameMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const data = Object.entries(byProduct).map(([, v]) => ({
    productId: v.productId,
    productName: v.productId ? (nameMap[v.productId] || v.description) : (v.description || 'Ad-hoc'),
    quantity: Math.round(v.quantity * 100) / 100,
    revenue: Math.round(v.revenue * 100) / 100,
  }));
  data.sort((a, b) => b.revenue - a.revenue);
  return res.status(200).json({ data, from: from || null, to: to || null });
}

export async function topCustomers(supabase, tenantId, req, res) {
  const from = (req.query?.from ?? '').toString().trim();
  const to = (req.query?.to ?? '').toString().trim();
  let q = supabase.from('invoices').select('customer_id, total').eq('tenant_id', tenantId).eq('status', 'paid');
  if (from) q = q.gte('invoice_date', from);
  if (to) q = q.lte('invoice_date', to);
  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ error: 'Failed to fetch invoices' });
  const byCustomer = {};
  for (const r of rows || []) {
    if (!r.customer_id) continue;
    if (!byCustomer[r.customer_id]) byCustomer[r.customer_id] = { invoiceCount: 0, totalPaid: 0 };
    byCustomer[r.customer_id].invoiceCount += 1;
    byCustomer[r.customer_id].totalPaid += Number(r.total || 0);
  }
  const customerIds = Object.keys(byCustomer);
  if (customerIds.length === 0) return res.status(200).json({ data: [], from: from || null, to: to || null });
  const { data: customers } = await supabase.from('customers').select('id, name').eq('tenant_id', tenantId).in('id', customerIds);
  const nameMap = Object.fromEntries((customers || []).map((c) => [c.id, c.name]));
  const data = customerIds.map((cid) => ({
    customerId: cid,
    customerName: nameMap[cid] || '—',
    invoiceCount: byCustomer[cid].invoiceCount,
    totalPaid: Math.round(byCustomer[cid].totalPaid * 100) / 100,
  }));
  data.sort((a, b) => b.totalPaid - a.totalPaid);
  return res.status(200).json({ data, from: from || null, to: to || null });
}

export async function taxSummary(supabase, tenantId, req, res) {
  let from = (req.query?.from ?? '').toString().trim();
  let to = (req.query?.to ?? '').toString().trim();
  if (!from || !to) {
    const def = getDefaultMonth();
    from = from || def.from;
    to = to || def.to;
  }
  const { data: invoices, error: invErr } = await supabase.from('invoices').select('id, invoice_date').eq('tenant_id', tenantId).in('status', ['sent', 'paid']).gte('invoice_date', from).lte('invoice_date', to);
  if (invErr) return res.status(500).json({ error: 'Failed to fetch tax summary' });
  const invoiceIds = (invoices || []).map((i) => i.id);
  if (invoiceIds.length === 0) return res.status(200).json({ period: { from, to }, byMonth: [], totals: { cgst: 0, sgst: 0, igst: 0, totalTax: 0 }, invoiceCount: 0 });
  const { data: items, error: itemsErr } = await supabase.from('invoice_items').select('invoice_id, cgst_amount, sgst_amount, igst_amount').in('invoice_id', invoiceIds);
  if (itemsErr) return res.status(500).json({ error: 'Failed to fetch tax details' });
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
  const byMonthList = Object.values(byMonth).map((r) => ({ month: r.month, cgst: Math.round(r.cgst * 100) / 100, sgst: Math.round(r.sgst * 100) / 100, igst: Math.round(r.igst * 100) / 100, totalTax: Math.round((r.cgst + r.sgst + r.igst) * 100) / 100 })).sort((a, b) => a.month.localeCompare(b.month));
  return res.status(200).json({ period: { from, to }, byMonth: byMonthList, totals: { cgst: Math.round(totalCgst * 100) / 100, sgst: Math.round(totalSgst * 100) / 100, igst: Math.round(totalIgst * 100) / 100, totalTax: Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100 }, invoiceCount: invoices.length });
}

export async function revenueTrend(supabase, tenantId, req, res) {
  const months = Math.min(24, Math.max(1, parseInt(req.query?.months, 10) || 6));
  const { data: rows, error } = await supabase.from('invoices').select('invoice_date, total').eq('tenant_id', tenantId).eq('status', 'paid');
  if (error) return res.status(500).json({ error: 'Failed to fetch revenue trend' });
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
  const data = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).map((v) => ({ ...v, revenue: Math.round(v.revenue * 100) / 100 }));
  return res.status(200).json({ data, months });
}

export async function productProfit(supabase, tenantId, req, res) {
  let from = (req.query?.from ?? '').toString().trim();
  let to = (req.query?.to ?? '').toString().trim();
  if (!from || !to) {
    const def = getDefaultMonth();
    from = from || def.from;
    to = to || def.to;
  }
  if (new Date(from) > new Date(to)) return res.status(400).json({ error: 'from must be before or equal to to' });
  const { data: invoices, error: invErr } = await supabase.from('invoices').select('id').eq('tenant_id', tenantId).in('status', ['sent', 'paid']).gte('invoice_date', from).lte('invoice_date', to);
  if (invErr) return res.status(500).json({ error: 'Failed to fetch product profit' });
  const invoiceIds = (invoices || []).map((i) => i.id);
  if (invoiceIds.length === 0) return res.json({ data: [], from, to });
  const { data: items, error: itemsErr } = await supabase.from('invoice_items').select('product_id, description, quantity, amount, cost_amount').in('invoice_id', invoiceIds);
  if (itemsErr) return res.status(500).json({ error: 'Failed to fetch invoice items' });
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
    return { product_id: v.product_id, product_name: v.product_id ? (nameMap[v.product_id] || v.description) : (v.description || 'Ad-hoc'), quantity_sold: Math.round(v.quantity * 100) / 100, sales, cost, profit: Math.round((sales - cost) * 100) / 100 };
  });
  data.sort((a, b) => b.profit - a.profit);
  return res.json({ data, from, to });
}

export async function pnl(supabase, tenantId, req, res) {
  const { from, to } = parsePnLRange(req.query);
  if (new Date(from) > new Date(to)) return res.status(400).json({ error: 'from must be before or equal to to' });
  const { data: invoices, error: invErr } = await supabase.from('invoices').select('id, total').eq('tenant_id', tenantId).in('status', ['sent', 'paid']).gte('invoice_date', from).lte('invoice_date', to);
  if (invErr) return res.status(500).json({ error: 'Failed to fetch P&L' });
  const totalSales = (invoices || []).reduce((s, i) => s + Number(i.total || 0), 0);
  const invoiceIds = (invoices || []).map((i) => i.id);
  let totalCost = 0;
  if (invoiceIds.length > 0) {
    const { data: items, error: itemsErr } = await supabase.from('invoice_items').select('cost_amount').in('invoice_id', invoiceIds);
    if (!itemsErr) totalCost = (items || []).reduce((s, r) => s + Number(r.cost_amount || 0), 0);
  }
  const { data: purchaseBills, error: pbErr } = await supabase.from('purchase_bills').select('total').eq('tenant_id', tenantId).eq('status', 'recorded').gte('bill_date', from).lte('bill_date', to);
  if (pbErr) return res.status(500).json({ error: 'Failed to fetch purchases' });
  const totalPurchases = (purchaseBills || []).reduce((s, b) => s + Number(b.total || 0), 0);
  const totalSalesR = Math.round(totalSales * 100) / 100;
  const totalCostR = Math.round(totalCost * 100) / 100;
  const totalPurchasesR = Math.round(totalPurchases * 100) / 100;
  const grossProfit = Math.round((totalSalesR - totalCostR) * 100) / 100;
  const profitPercent = totalSalesR > 0 ? Math.round(grossProfit / totalSalesR * 10000) / 100 : 0;
  return res.json({ from, to, totalSales: totalSalesR, totalPurchases: totalPurchasesR, totalCost: totalCostR, grossProfit, profitPercent });
}
