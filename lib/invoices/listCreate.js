import { supabase } from '../../api/_lib/supabase.js';
import { requireAuth } from '../../api/_lib/auth.js';

async function getNextInvoiceNumber(tenantId) {
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('invoice_prefix, invoice_next_number')
    .eq('id', tenantId)
    .single();
  if (tenantErr || !tenantRow) {
    const prefix = 'INV-';
    const next = 1;
    return { invoiceNumber: `${prefix}${String(next).padStart(4, '0')}`, nextNumber: next };
  }
  const prefix = (tenantRow.invoice_prefix ?? 'INV-').toString().trim() || 'INV-';
  const next = Math.max(1, parseInt(tenantRow.invoice_next_number, 10) || 1);
  const invoiceNumber = `${prefix}${String(next).padStart(4, '0')}`;
  return { invoiceNumber, nextNumber: next };
}

function validateItem(item, index) {
  const desc = (item?.description ?? '').toString().trim();
  if (!desc) return { error: `items[${index}].description is required` };
  const qty = Number(item?.quantity);
  if (qty === undefined || Number.isNaN(qty) || qty <= 0) return { error: `items[${index}].quantity must be > 0` };
  const unitPrice = Number(item?.unitPrice ?? item?.unit_price);
  if (unitPrice === undefined || Number.isNaN(unitPrice) || unitPrice < 0) return { error: `items[${index}].unitPrice must be >= 0` };
  return { description: desc, quantity: qty, unit_price: unitPrice };
}

function parseBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const auth = await requireAuth(req);
    if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
    const tenantId = auth.tenantId;

    if (req.method === 'POST') {
      const body = parseBody(req);
    const customerId = (body.customerId ?? body.customer_id ?? '').toString().trim();
    if (!customerId) return res.status(400).json({ error: 'customerId is required' });
    const invoiceDate = (body.invoiceDate ?? body.invoice_date ?? '').toString().trim();
    if (!invoiceDate) return res.status(400).json({ error: 'invoiceDate is required' });
    if (Number.isNaN(new Date(invoiceDate).getTime())) return res.status(400).json({ error: 'invoiceDate must be a valid date' });
    const status = (body.status ?? 'draft').toString().toLowerCase();
    if (!['draft', 'sent', 'paid'].includes(status)) return res.status(400).json({ error: 'status must be draft, sent, or paid' });
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ error: 'items array is required and non-empty' });

    const { data: customer } = await supabase.from('customers').select('id').eq('id', customerId).eq('tenant_id', tenantId).single();
    if (!customer) return res.status(400).json({ error: 'Customer not found or does not belong to your shop' });

    const gstType = (body.gst_type ?? body.gstType ?? 'intra').toString().toLowerCase() === 'inter' ? 'inter' : 'intra';
    const { data: tenantRow } = await supabase.from('tenants').select('tax_percent').eq('id', tenantId).single();
    const tenantTaxPercent = tenantRow?.tax_percent != null ? Number(tenantRow.tax_percent) : 0;

    const items = [];
    for (let i = 0; i < rawItems.length; i++) {
      const v = validateItem(rawItems[i], i);
      if (v.error) return res.status(400).json({ error: v.error });
      let desc = v.description;
      let unitPrice = v.unit_price;
      let productTaxPercent = null;
      let hsnSacCode = null;
      const productId = (rawItems[i].productId ?? rawItems[i].product_id)?.toString().trim();
      let costPrice = 0;
      if (productId) {
        const { data: product } = await supabase.from('products').select('name, price, tax_percent, hsn_sac_code, last_purchase_price').eq('id', productId).eq('tenant_id', tenantId).single();
        if (product) {
          if (!desc) desc = product.name;
          if (unitPrice == null) unitPrice = Number(product.price);
          if (product.tax_percent != null) productTaxPercent = Number(product.tax_percent);
          if (product.hsn_sac_code) hsnSacCode = String(product.hsn_sac_code).trim().slice(0, 20) || null;
          costPrice = product.last_purchase_price != null ? Number(product.last_purchase_price) : 0;
        }
      }
      const taxPercentItem = productTaxPercent ?? tenantTaxPercent;
      const amount = Math.round(v.quantity * unitPrice * 100) / 100;
      const costAmount = Math.round(v.quantity * costPrice * 100) / 100;
      const itemTax = Math.round(amount * taxPercentItem / 100 * 100) / 100;
      const cgst = gstType === 'intra' ? Math.round(itemTax / 2 * 100) / 100 : 0;
      const sgst = gstType === 'intra' ? Math.round((itemTax - cgst) * 100) / 100 : 0;
      const igst = gstType === 'inter' ? itemTax : 0;
      items.push({
        product_id: productId || null,
        description: desc,
        quantity: v.quantity,
        unit_price: unitPrice,
        amount,
        cost_price: costPrice,
        cost_amount: costAmount,
        tax_percent: taxPercentItem,
        gst_type: gstType,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        hsn_sac_code: hsnSacCode,
      });
    }
    const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const taxAmount = Math.round(items.reduce((s, i) => s + i.cgst_amount + i.sgst_amount + i.igst_amount, 0) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const effectiveTaxPercent = subtotal > 0 ? Math.round(taxAmount / subtotal * 10000) / 100 : tenantTaxPercent;
    const { invoiceNumber, nextNumber } = await getNextInvoiceNumber(tenantId);

    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      status,
      subtotal,
      tax_percent: effectiveTaxPercent,
      tax_amount: taxAmount,
      total,
      gst_type: gstType,
    }).select().single();
    if (invErr) {
      console.error(invErr);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }
    const itemRow = (it, includeCost) => {
      const row = {
        invoice_id: invoice.id,
        product_id: it.product_id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
        tax_percent: it.tax_percent,
        gst_type: it.gst_type,
        cgst_amount: it.cgst_amount,
        sgst_amount: it.sgst_amount,
        igst_amount: it.igst_amount,
        hsn_sac_code: it.hsn_sac_code,
      };
      if (includeCost) {
        row.cost_price = it.cost_price;
        row.cost_amount = it.cost_amount;
      }
      return row;
    };
    for (const it of items) {
      let itemErr = (await supabase.from('invoice_items').insert(itemRow(it, true))).error;
      if (itemErr && (String(itemErr.message || '').includes('cost_price') || String(itemErr.message || '').includes('cost_amount') || String(itemErr.message || '').includes('does not exist'))) {
        itemErr = (await supabase.from('invoice_items').insert(itemRow(it, false))).error;
      }
      if (itemErr) {
        console.error(itemErr);
        await supabase.from('invoices').delete().eq('id', invoice.id);
        return res.status(500).json({ error: 'Failed to create invoice items' });
      }
    }
    await supabase.from('tenants').update({ invoice_next_number: nextNumber + 1 }).eq('id', tenantId);
      const { data: itemsData } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('created_at');
      return res.status(201).json({ ...invoice, invoice_items: itemsData || [] });
    }

    if (req.method === 'GET') {
      const format = (req.query?.format ?? '').toString().toLowerCase();
      if (format === 'csv') {
        const { data: rows, error } = await supabase
          .from('invoices')
          .select('invoice_number, invoice_date, status, subtotal, tax_amount, total, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(2000);
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to export' });
        }
        const header = 'Invoice Number,Date,Status,Subtotal,Tax,Total,Created At\n';
        const csv = header + (rows || []).map((r) =>
          [r.invoice_number, r.invoice_date, r.status, r.subtotal, r.tax_amount ?? 0, r.total, r.created_at].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
        return res.status(200).send(csv);
      }
      let q = supabase.from('invoices').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('created_at', { ascending: false });
      const status = (req.query?.status ?? '').toString().trim();
      if (status) q = q.eq('status', status);
      const customerId = (req.query?.customerId ?? '').toString().trim();
      if (customerId) q = q.eq('customer_id', customerId);
      const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 100);
      const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
      q = q.range(offset, offset + limit - 1);
      const { data, error, count } = await q;
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to list invoices' });
      }
      return res.json({ data: data || [], total: count ?? data?.length ?? 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Invoices handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
