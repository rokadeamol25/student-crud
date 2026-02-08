/**
 * Invoices API: create, list, get one. All filtered by req.tenantId.
 * Invoice number: per-tenant sequence INV-0001, INV-0002, ...
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function nextInvoiceNumber(tenantId) {
  const { data: rows } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1000);
  let max = 0;
  if (rows && rows.length) {
    for (const r of rows) {
      const num = parseInt(String(r.invoice_number).replace(/\D/g, ''), 10);
      if (!Number.isNaN(num) && num > max) max = num;
    }
  }
  const next = max + 1;
  return `INV-${String(next).padStart(4, '0')}`;
}

function validateItem(item, index) {
  const desc = (item?.description ?? '').toString().trim();
  if (!desc) return { error: `items[${index}].description is required` };
  const qty = Number(item?.quantity);
  if (qty === undefined || Number.isNaN(qty) || qty <= 0) {
    return { error: `items[${index}].quantity must be > 0` };
  }
  const unitPrice = Number(item?.unitPrice ?? item?.unit_price);
  if (unitPrice === undefined || Number.isNaN(unitPrice) || unitPrice < 0) {
    return { error: `items[${index}].unitPrice must be >= 0` };
  }
  const amount = Math.round(qty * unitPrice * 100) / 100;
  return { description: desc, quantity: qty, unit_price: unitPrice, amount };
}

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const customerId = (body.customerId ?? body.customer_id ?? '').toString().trim();
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }
    const invoiceDate = (body.invoiceDate ?? body.invoice_date ?? '').toString().trim();
    if (!invoiceDate) {
      return res.status(400).json({ error: 'invoiceDate is required' });
    }
    const date = new Date(invoiceDate);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: 'invoiceDate must be a valid date' });
    }
    const status = (body.status ?? 'draft').toString().toLowerCase();
    if (!['draft', 'sent', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'status must be draft, sent, or paid' });
    }
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return res.status(400).json({ error: 'items array is required and non-empty' });
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('tenant_id', req.tenantId)
      .single();
    if (!customer) {
      return res.status(400).json({ error: 'Customer not found or does not belong to your shop' });
    }

    const items = [];
    for (let i = 0; i < rawItems.length; i++) {
      const v = validateItem(rawItems[i], i);
      if (v.error) return res.status(400).json({ error: v.error });
      let desc = v.description;
      let unitPrice = v.unit_price;
      const productId = (rawItems[i].productId ?? rawItems[i].product_id)?.toString().trim();
      if (productId) {
        const { data: product } = await supabase
          .from('products')
          .select('name, price')
          .eq('id', productId)
          .eq('tenant_id', req.tenantId)
          .single();
        if (product) {
          if (!desc) desc = product.name;
          if (unitPrice === undefined || unitPrice === null) unitPrice = Number(product.price);
        }
      }
      const amount = Math.round(v.quantity * unitPrice * 100) / 100;
      items.push({
        product_id: productId || null,
        description: desc,
        quantity: v.quantity,
        unit_price: unitPrice,
        amount,
      });
    }

    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    const total = Math.round(subtotal * 100) / 100;
    const invoiceNumber = await nextInvoiceNumber(req.tenantId);

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        tenant_id: req.tenantId,
        customer_id: customerId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        status,
        subtotal,
        total,
      })
      .select()
      .single();
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

    const { data: fullInvoice } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoice.id)
      .single();
    return res.status(201).json(fullInvoice || invoice);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
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
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(`
        *,
        customers(id, name, email, phone, address)
      `)
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .order('created_at');
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const { customers: _c, ...inv } = invoice;
    return res.json({ ...inv, customer: customer || null, invoice_items: items || [] });
  } catch (err) {
    next(err);
  }
});

export default router;
