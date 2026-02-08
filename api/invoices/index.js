import { supabase } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

async function nextInvoiceNumber(tenantId) {
  const { data: rows } = await supabase.from('invoices').select('invoice_number').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1000);
  let max = 0;
  if (rows?.length) {
    for (const r of rows) {
      const num = parseInt(String(r.invoice_number).replace(/\D/g, ''), 10);
      if (!Number.isNaN(num) && num > max) max = num;
    }
  }
  return `INV-${String(max + 1).padStart(4, '0')}`;
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

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const tenantId = auth.tenantId;

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
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

    const items = [];
    for (let i = 0; i < rawItems.length; i++) {
      const v = validateItem(rawItems[i], i);
      if (v.error) return res.status(400).json({ error: v.error });
      let desc = v.description;
      let unitPrice = v.unit_price;
      const productId = (rawItems[i].productId ?? rawItems[i].product_id)?.toString().trim();
      if (productId) {
        const { data: product } = await supabase.from('products').select('name, price').eq('id', productId).eq('tenant_id', tenantId).single();
        if (product) {
          if (!desc) desc = product.name;
          if (unitPrice == null) unitPrice = Number(product.price);
        }
      }
      const amount = Math.round(v.quantity * unitPrice * 100) / 100;
      items.push({ product_id: productId || null, description: desc, quantity: v.quantity, unit_price: unitPrice, amount });
    }
    const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const invoiceNumber = await nextInvoiceNumber(tenantId);

    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      status,
      subtotal: total,
      total,
    }).select().single();
    if (invErr) {
      console.error(invErr);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }
    for (const it of items) {
      const { error: itemErr } = await supabase.from('invoice_items').insert({
        invoice_id: invoice.id,
        product_id: it.product_id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
      });
      if (itemErr) {
        console.error(itemErr);
        await supabase.from('invoices').delete().eq('id', invoice.id);
        return res.status(500).json({ error: 'Failed to create invoice items' });
      }
    }
    const { data: itemsData } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('created_at');
    return res.status(201).json({ ...invoice, invoice_items: itemsData || [] });
  }

  if (req.method === 'GET') {
    let q = supabase.from('invoices').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    const status = (req.query?.status ?? '').toString().trim();
    if (status) q = q.eq('status', status);
    const customerId = (req.query?.customerId ?? '').toString().trim();
    if (customerId) q = q.eq('customer_id', customerId);
    const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 100);
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
    q = q.range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to list invoices' });
    }
    return res.json(data || []);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
