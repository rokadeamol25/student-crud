/**
 * Reports API: sales summary, invoice summary, outstanding, top products/customers, tax summary, revenue trend.
 * All filtered by req.tenantId.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function getDefaultMonth() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

router.get('/sales-summary', async (req, res, next) => {
  try {
    let from = (req.query?.from ?? '').toString().trim();
    let to = (req.query?.to ?? '').toString().trim();
    if (!from || !to) {
      const def = getDefaultMonth();
      from = from || def.from;
      to = to || def.to;
    }
    if (new Date(from) > new Date(to)) {
      return res.status(400).json({ error: 'from must be before or equal to to' });
    }
    const { data: rows, error } = await supabase
      .from('invoices')
      .select('total')
      .eq('tenant_id', req.tenantId)
      .eq('status', 'paid')
      .gte('invoice_date', from)
      .lte('invoice_date', to);
    if (error) throw error;
    const totalRevenue = (rows || []).reduce((s, r) => s + Number(r.total || 0), 0);
    res.json({ totalRevenue: Math.round(totalRevenue * 100) / 100, invoiceCount: (rows || []).length, from, to });
  } catch (err) {
    next(err);
  }
});

router.get('/invoice-summary', async (req, res, next) => {
  try {
    const { data: rows, error } = await supabase
      .from('invoices')
      .select('status, total')
      .eq('tenant_id', req.tenantId);
    if (error) throw error;
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
    res.json({ draft, sent, paid });
  } catch (err) {
    next(err);
  }
});

router.get('/outstanding', async (req, res, next) => {
  try {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, customer_id, total')
      .eq('tenant_id', req.tenantId)
      .eq('status', 'sent')
      .order('invoice_date', { ascending: false });
    if (error) throw error;
    const list = invoices || [];
    const customerIds = [...new Set(list.map((i) => i.customer_id).filter(Boolean))];
    let customers = [];
    if (customerIds.length > 0) {
      const { data: cust } = await supabase.from('customers').select('id, name').eq('tenant_id', req.tenantId).in('id', customerIds);
      customers = cust || [];
    }
    const custMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
    const totalDue = list.reduce((s, i) => s + Number(i.total || 0), 0);
    res.json({
      totalDue: Math.round(totalDue * 100) / 100,
      invoices: list.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        customer_name: custMap[inv.customer_id] || '—',
        total: Number(inv.total),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/top-products', async (req, res, next) => {
  try {
    const from = (req.query?.from ?? '').toString().trim();
    const to = (req.query?.to ?? '').toString().trim();
    let invQuery = supabase.from('invoices').select('id').eq('tenant_id', req.tenantId).eq('status', 'paid');
    if (from) invQuery = invQuery.gte('invoice_date', from);
    if (to) invQuery = invQuery.lte('invoice_date', to);
    const { data: paidInvoices, error: invErr } = await invQuery;
    if (invErr) throw invErr;
    const invoiceIds = (paidInvoices || []).map((i) => i.id);
    if (invoiceIds.length === 0) return res.json({ data: [], from: from || null, to: to || null });
    const { data: items, error: itemsErr } = await supabase.from('invoice_items').select('product_id, description, quantity, amount').in('invoice_id', invoiceIds);
    if (itemsErr) throw itemsErr;
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
      const { data: prods } = await supabase.from('products').select('id, name').eq('tenant_id', req.tenantId).in('id', productIds);
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
    res.json({ data, from: from || null, to: to || null });
  } catch (err) {
    next(err);
  }
});

router.get('/top-customers', async (req, res, next) => {
  try {
    const from = (req.query?.from ?? '').toString().trim();
    const to = (req.query?.to ?? '').toString().trim();
    let q = supabase.from('invoices').select('customer_id, total').eq('tenant_id', req.tenantId).eq('status', 'paid');
    if (from) q = q.gte('invoice_date', from);
    if (to) q = q.lte('invoice_date', to);
    const { data: rows, error } = await q;
    if (error) throw error;
    const byCustomer = {};
    for (const r of rows || []) {
      if (!r.customer_id) continue;
      if (!byCustomer[r.customer_id]) byCustomer[r.customer_id] = { invoiceCount: 0, totalPaid: 0 };
      byCustomer[r.customer_id].invoiceCount += 1;
      byCustomer[r.customer_id].totalPaid += Number(r.total || 0);
    }
    const customerIds = Object.keys(byCustomer);
    if (customerIds.length === 0) return res.json({ data: [], from: from || null, to: to || null });
    const { data: customers } = await supabase.from('customers').select('id, name').eq('tenant_id', req.tenantId).in('id', customerIds);
    const nameMap = Object.fromEntries((customers || []).map((c) => [c.id, c.name]));
    const data = customerIds.map((customerId) => ({
      customerId,
      customerName: nameMap[customerId] || '—',
      invoiceCount: byCustomer[customerId].invoiceCount,
      totalPaid: Math.round(byCustomer[customerId].totalPaid * 100) / 100,
    }));
    data.sort((a, b) => b.totalPaid - a.totalPaid);
    res.json({ data, from: from || null, to: to || null });
  } catch (err) {
    next(err);
  }
});

router.get('/tax-summary', async (req, res, next) => {
  try {
    let from = (req.query?.from ?? '').toString().trim();
    let to = (req.query?.to ?? '').toString().trim();
    if (!from || !to) {
      const def = getDefaultMonth();
      from = from || def.from;
      to = to || def.to;
    }
    const { data: rows, error } = await supabase
      .from('invoices')
      .select('subtotal, tax_amount')
      .eq('tenant_id', req.tenantId)
      .eq('status', 'paid')
      .gte('invoice_date', from)
      .lte('invoice_date', to);
    if (error) throw error;
    let subtotal = 0, taxAmount = 0;
    for (const r of rows || []) {
      subtotal += Number(r.subtotal ?? r.total ?? 0);
      taxAmount += Number(r.tax_amount ?? 0);
    }
    res.json({
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      invoiceCount: (rows || []).length,
      from,
      to,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/revenue-trend', async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, parseInt(req.query?.months, 10) || 6));
    const { data: rows, error } = await supabase
      .from('invoices')
      .select('invoice_date, total')
      .eq('tenant_id', req.tenantId)
      .eq('status', 'paid');
    if (error) throw error;
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
    res.json({ data, months });
  } catch (err) {
    next(err);
  }
});

export default router;
