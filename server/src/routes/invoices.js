/**
 * Invoices API: create, list, get one. All filtered by req.tenantId.
 * Invoice number: per-tenant sequence INV-0001, INV-0002, ...
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

/**
 * Deduct stock for all items when an invoice is sent.
 * - Quantity products: decrease products.stock
 * - Serial products: mark selected serials as 'sold'
 * - Batch products: FEFO (first-expiry first-out) deduction
 * Logs stock_movements for every deduction.
 */
async function deductStock(tenantId, invoiceId, items, serialIds = {}) {
  const consumed = {}; // product_id -> next index into serialIds[product_id]
  for (const it of items) {
    if (!it.product_id) continue;
    const qty = Number(it.quantity) || 0;
    if (qty <= 0) continue;

    let trackingType = 'quantity';
    try {
      const { data: prod } = await supabase.from('products').select('stock, tracking_type').eq('id', it.product_id).single();
      if (!prod) continue;
      trackingType = prod.tracking_type || 'quantity';

      if (trackingType === 'serial') {
        const allForProduct = serialIds[it.product_id] || [];
        const start = consumed[it.product_id] || 0;
        const selectedSerials = allForProduct.slice(start, start + qty);
        consumed[it.product_id] = start + selectedSerials.length;
        const invoiceItemId = it.id || null;
        for (const serialId of selectedSerials) {
          await supabase.from('product_serials').update({ status: 'sold', invoice_item_id: invoiceItemId }).eq('id', serialId).eq('tenant_id', tenantId);
          try {
            await supabase.from('stock_movements').insert({
              tenant_id: tenantId,
              product_id: it.product_id,
              movement_type: 'sale',
              direction: 'out',
              quantity: 1,
              reference_type: 'invoice',
              reference_id: invoiceId,
              serial_id: serialId,
              cost_price: it.cost_price || 0,
            });
          } catch (e) { console.error('Stock movement insert error:', e.message); }
        }
        if (selectedSerials.length < qty) {
          const remaining = qty - selectedSerials.length;
          const { data: avail } = await supabase
            .from('product_serials')
            .select('id')
            .eq('product_id', it.product_id)
            .eq('tenant_id', tenantId)
            .eq('status', 'available')
            .order('created_at')
            .limit(remaining);
          for (const s of (avail || [])) {
            await supabase.from('product_serials').update({ status: 'sold', invoice_item_id: invoiceItemId }).eq('id', s.id);
            try {
              await supabase.from('stock_movements').insert({
                tenant_id: tenantId,
                product_id: it.product_id,
                movement_type: 'sale',
                direction: 'out',
                quantity: 1,
                reference_type: 'invoice',
                reference_id: invoiceId,
                serial_id: s.id,
                cost_price: it.cost_price || 0,
              });
            } catch (e) { console.error('Stock movement insert error:', e.message); }
          }
        }
      } else if (trackingType === 'batch') {
        // FEFO: first-expiry first-out
        let remaining = qty;
        const { data: batches } = await supabase
          .from('product_batches')
          .select('id, quantity, cost_price')
          .eq('product_id', it.product_id)
          .eq('tenant_id', tenantId)
          .gt('quantity', 0)
          .order('expiry_date', { ascending: true, nullsFirst: false });
        for (const batch of (batches || [])) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, Number(batch.quantity));
          const newQty = Math.round((Number(batch.quantity) - deduct) * 100) / 100;
          await supabase.from('product_batches').update({ quantity: newQty }).eq('id', batch.id);
          remaining -= deduct;
          try {
            await supabase.from('stock_movements').insert({
              tenant_id: tenantId,
              product_id: it.product_id,
              movement_type: 'sale',
              direction: 'out',
              quantity: deduct,
              reference_type: 'invoice',
              reference_id: invoiceId,
              batch_id: batch.id,
              cost_price: batch.cost_price || it.cost_price || 0,
            });
          } catch (e) { console.error('Stock movement insert error:', e.message); }
        }
      } else {
        // Quantity product: just log movement
        try {
          await supabase.from('stock_movements').insert({
            tenant_id: tenantId,
            product_id: it.product_id,
            movement_type: 'sale',
            direction: 'out',
            quantity: qty,
            reference_type: 'invoice',
            reference_id: invoiceId,
            cost_price: it.cost_price || 0,
          });
        } catch (e) { console.error('Stock movement insert error:', e.message); }
      }

      // Decrease products.stock (all types)
      const newStock = Math.max(0, Number(prod.stock) - qty);
      await supabase.from('products').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', it.product_id);
    } catch (e) {
      console.error('Stock deduction error:', e.message);
    }
  }
}

function normalizeDiscount(raw) {
  const type = (raw?.discountType ?? raw?.discount_type ?? 'none').toString().toLowerCase();
  const valueRaw = raw?.discountValue ?? raw?.discount_value;
  const value = Number(valueRaw);
  const safeValue = Number.isNaN(value) || value < 0 ? 0 : value;
  if (type === 'flat') return { type: 'flat', value: safeValue };
  if (type === 'percent') return { type: 'percent', value: safeValue };
  return { type: 'none', value: 0 };
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
  const baseAmount = Math.round(qty * unitPrice * 100) / 100;
  const { type: discountType, value: discountValue } = normalizeDiscount(item);
  let discountAmount = 0;
  if (discountType === 'flat') {
    discountAmount = Math.min(baseAmount, discountValue);
  } else if (discountType === 'percent') {
    discountAmount = Math.round(baseAmount * discountValue / 100 * 100) / 100;
    if (discountAmount > baseAmount) discountAmount = baseAmount;
  }
  const amount = baseAmount - discountAmount;
  return {
    description: desc,
    quantity: qty,
    unit_price: unitPrice,
    amount,
    discount_type: discountType === 'none' ? null : discountType,
    discount_value: discountType === 'none' ? 0 : discountValue,
    discount_amount: discountAmount,
  };
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

    const gstType = (body.gst_type ?? body.gstType ?? 'intra').toString().toLowerCase() === 'inter' ? 'inter' : 'intra';
    const roughBillRef = (body.rough_bill_ref ?? body.roughBillRef ?? '').toString().trim() || null;
    const { data: tenantRow } = await supabase.from('tenants').select('tax_percent').eq('id', req.tenantId).single();
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
      let prodCompany = null, prodRamStorage = null, prodImei = null, prodColor = null;
      if (productId) {
        let { data: product, error: pErr } = await supabase
          .from('products')
          .select('name, price, tax_percent, hsn_sac_code, last_purchase_price, company, ram_storage, imei, color')
          .eq('id', productId)
          .eq('tenant_id', req.tenantId)
          .single();
        // Fallback if extra columns don't exist yet (migration 00011 not applied)
        if (pErr && String(pErr.message || '').includes('does not exist')) {
          ({ data: product } = await supabase
            .from('products')
            .select('name, price, tax_percent, hsn_sac_code, last_purchase_price')
            .eq('id', productId)
            .eq('tenant_id', req.tenantId)
            .single());
        }
        if (product) {
          if (!desc) desc = product.name;
          if (unitPrice === undefined || unitPrice === null) unitPrice = Number(product.price);
          if (product.tax_percent != null) productTaxPercent = Number(product.tax_percent);
          if (product.hsn_sac_code) hsnSacCode = String(product.hsn_sac_code).trim().slice(0, 20) || null;
          costPrice = product.last_purchase_price != null ? Number(product.last_purchase_price) : 0;
          prodCompany = product.company || null;
          prodRamStorage = product.ram_storage || null;
          prodImei = product.imei || null;
          prodColor = product.color || null;
        }
      }
      // Extra fields are always pulled from the product (read-only on invoices)
      const taxPercentItem = productTaxPercent ?? tenantTaxPercent;
      const amount = v.amount;
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
        company: prodCompany,
        ram_storage: prodRamStorage,
        imei: prodImei,
        color: prodColor,
        discount_type: v.discount_type,
        discount_value: v.discount_value,
        discount_amount: v.discount_amount,
      });
    }
    const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const discountTotal = Math.round(items.reduce((s, i) => s + (i.discount_amount || 0), 0) * 100) / 100;
    const taxAmount = Math.round(items.reduce((s, i) => s + i.cgst_amount + i.sgst_amount + i.igst_amount, 0) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const effectiveTaxPercent = subtotal > 0 ? Math.round(taxAmount / subtotal * 10000) / 100 : tenantTaxPercent;
    let { invoiceNumber, nextNumber } = await getNextInvoiceNumber(req.tenantId);

    // Retry with incremented number if duplicate key (up to 10 attempts)
    let invoice = null;
    let invErr = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      ({ data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          tenant_id: req.tenantId,
          customer_id: customerId,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          status,
          subtotal,
          tax_percent: effectiveTaxPercent,
          tax_amount: taxAmount,
          discount_total: discountTotal,
          total,
          gst_type: gstType,
          rough_bill_ref: roughBillRef,
        })
        .select()
        .single());
      if (!invErr) break;
      // If duplicate key, bump number and retry
      if (invErr.code === '23505') {
        nextNumber += 1;
        const prefix = invoiceNumber.replace(/\d+$/, '');
        invoiceNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`;
        continue;
      }
      break; // other error, stop retrying
    }
    if (invErr) {
      console.error(invErr);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }

    const itemRow = (it, includeCost, includeExtras) => {
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
      if (includeExtras) {
        row.company = it.company || null;
        row.ram_storage = it.ram_storage || null;
        row.imei = it.imei || null;
        row.color = it.color || null;
      }
      return row;
    };
    for (const it of items) {
      let { error: itemErr } = await supabase.from('invoice_items').insert(itemRow(it, true, true));
      if (itemErr && String(itemErr.message || '').includes('does not exist')) {
        ({ error: itemErr } = await supabase.from('invoice_items').insert(itemRow(it, true, false)));
      }
      if (itemErr && String(itemErr.message || '').includes('does not exist')) {
        ({ error: itemErr } = await supabase.from('invoice_items').insert(itemRow(it, false, false)));
      }
      if (itemErr) {
        console.error(itemErr);
        await supabase.from('invoices').delete().eq('id', invoice.id);
        return res.status(500).json({ error: 'Failed to create invoice items' });
      }
    }

    if (status === 'sent' || status === 'paid') {
      const serialIds = body.serialIds || {};
      const { data: insertedItems } = await supabase
        .from('invoice_items')
        .select('id, product_id, quantity, cost_price')
        .eq('invoice_id', invoice.id)
        .order('created_at');
      await deductStock(req.tenantId, invoice.id, insertedItems || items, serialIds);
    }

    const { data: fullInvoice } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoice.id)
      .single();
    await supabase.from('tenants').update({ invoice_next_number: nextNumber + 1 }).eq('id', req.tenantId);
    return res.status(201).json(fullInvoice || invoice);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const format = (req.query?.format ?? '').toString().toLowerCase();
    if (format === 'csv') {
      const { data: rows, error } = await supabase
        .from('invoices')
        .select('invoice_number, invoice_date, status, subtotal, tax_amount, total, created_at')
        .eq('tenant_id', req.tenantId)
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
      return res.send(csv);
    }
    let q = supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
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
  } catch (err) {
    next(err);
  }
});

const ALLOWED_NEXT = { draft: ['sent'], sent: ['paid'], paid: [] };
const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer'];

async function recomputeInvoiceAmountPaid(invoiceId, tenantId) {
  const { data: rows } = await supabase.from('payments').select('amount').eq('invoice_id', invoiceId);
  const amountPaid = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const rounded = Math.round(amountPaid * 100) / 100;
  const { data: inv } = await supabase.from('invoices').select('total').eq('id', invoiceId).eq('tenant_id', tenantId).single();
  const total = Number(inv?.total) || 0;
  const status = rounded >= total ? 'paid' : 'sent';
  await supabase.from('invoices').update({ amount_paid: rounded, status }).eq('id', invoiceId).eq('tenant_id', tenantId);
}

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
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at'),
      supabase.from('payments').select('*').eq('invoice_id', id).eq('tenant_id', req.tenantId).order('paid_at').order('created_at'),
    ]);
    const rawItems = items || [];
    const itemIds = rawItems.map((i) => i.id).filter(Boolean);
    const productIds = [...new Set(rawItems.map((i) => i.product_id).filter(Boolean))];

    const [serialsRes, productsRes] = await Promise.all([
      itemIds.length ? supabase.from('product_serials').select('id, serial_number, invoice_item_id').in('invoice_item_id', itemIds).order('created_at') : { data: [] },
      productIds.length ? supabase.from('products').select('id, name, tracking_type').in('id', productIds) : { data: [] },
    ]);

    const serialsByItemId = {};
    (serialsRes.data || []).forEach((s) => {
      const key = s.invoice_item_id;
      if (!key) return;
      if (!serialsByItemId[key]) serialsByItemId[key] = [];
      serialsByItemId[key].push({ id: s.id, serial_number: s.serial_number });
    });
    const productsById = {};
    (productsRes.data || []).forEach((p) => { productsById[p.id] = p; });

    const enrichedItems = rawItems.map((it) => ({
      ...it,
      serials: serialsByItemId[it.id] || [],
      product: productsById[it.product_id] || null,
    }));

    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const amountPaid = Number(invoice.amount_paid) || 0;
    const total = Number(invoice.total) || 0;
    const balance = Math.round((total - amountPaid) * 100) / 100;
    const { customers: _c, ...inv } = invoice;
    return res.json({
      ...inv,
      amount_paid: amountPaid,
      balance,
      customer: customer || null,
      invoice_items: enrichedItems,
      payments: payments || [],
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payments', async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const amount = Number(body.amount);
    if (amount === undefined || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const method = (body.payment_method ?? body.paymentMethod ?? '').toString().toLowerCase();
    if (!PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({ error: 'payment_method must be cash, upi, or bank_transfer' });
    }
    const reference = (body.reference ?? '').toString().trim() || null;
    let paidAt = body.paid_at ?? body.paidAt;
    if (paidAt) {
      paidAt = new Date(paidAt);
      if (Number.isNaN(paidAt.getTime())) paidAt = new Date();
    } else {
      paidAt = new Date();
    }
    const paidAtDate = paidAt.toISOString().slice(0, 10);

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, total, amount_paid')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });
    const total = Number(invoice.total) || 0;
    const amountPaid = Number(invoice.amount_paid) || 0;
    const balance = Math.round((total - amountPaid) * 100) / 100;
    if (amount > balance) {
      return res.status(400).json({ error: `Amount exceeds balance due (${balance})` });
    }

    const amountRounded = Math.round(amount * 100) / 100;
    const { data: payment, error: insertErr } = await supabase
      .from('payments')
      .insert({
        tenant_id: req.tenantId,
        invoice_id: id,
        amount: amountRounded,
        payment_method: method,
        reference,
        paid_at: paidAtDate,
      })
      .select()
      .single();
    if (insertErr) {
      console.error(insertErr);
      return res.status(500).json({ error: 'Failed to record payment' });
    }
    await recomputeInvoiceAmountPaid(id, req.tenantId);
    return res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/payments/:paymentId', async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;
    const { data: payment, error: fetchErr } = await supabase
      .from('payments')
      .select('id')
      .eq('id', paymentId)
      .eq('invoice_id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (fetchErr || !payment) return res.status(404).json({ error: 'Payment not found' });
    const { error: delErr } = await supabase.from('payments').delete().eq('id', paymentId).eq('tenant_id', req.tenantId);
    if (delErr) {
      console.error(delErr);
      return res.status(500).json({ error: 'Failed to delete payment' });
    }
    await recomputeInvoiceAmountPaid(id, req.tenantId);
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : null;

    if (rawItems !== null) {
      // Full draft update (with optional status change to 'sent')
      const newStatus = (body.status ?? 'draft').toString().toLowerCase();
      if (!['draft', 'sent'].includes(newStatus)) return res.status(400).json({ error: 'status must be draft or sent when updating items' });
      const { data: existing, error: fetchErr } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .eq('tenant_id', req.tenantId)
        .single();
      if (fetchErr || !existing) return res.status(404).json({ error: 'Invoice not found' });
      if (existing.status === 'paid') return res.status(400).json({ error: 'Paid invoices cannot be edited' });

      const customerId = (body.customerId ?? body.customer_id ?? '').toString().trim();
      if (!customerId) return res.status(400).json({ error: 'customerId is required' });
      const invoiceDate = (body.invoiceDate ?? body.invoice_date ?? '').toString().trim();
      if (!invoiceDate) return res.status(400).json({ error: 'invoiceDate is required' });
      if (Number.isNaN(new Date(invoiceDate).getTime())) return res.status(400).json({ error: 'invoiceDate must be a valid date' });
      if (rawItems.length === 0) return res.status(400).json({ error: 'items array is required and non-empty' });

      const { data: customer } = await supabase.from('customers').select('id').eq('id', customerId).eq('tenant_id', req.tenantId).single();
      if (!customer) return res.status(400).json({ error: 'Customer not found or does not belong to your shop' });

      const gstType = (body.gst_type ?? body.gstType ?? 'intra').toString().toLowerCase() === 'inter' ? 'inter' : 'intra';
      const { data: tenantRow } = await supabase.from('tenants').select('tax_percent').eq('id', req.tenantId).single();
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
        let prodCompany = null, prodRamStorage = null, prodImei = null, prodColor = null;
        if (productId) {
          let { data: product, error: pErr } = await supabase.from('products').select('name, price, tax_percent, hsn_sac_code, last_purchase_price, company, ram_storage, imei, color').eq('id', productId).eq('tenant_id', req.tenantId).single();
          if (pErr && String(pErr.message || '').includes('does not exist')) {
            ({ data: product } = await supabase.from('products').select('name, price, tax_percent, hsn_sac_code, last_purchase_price').eq('id', productId).eq('tenant_id', req.tenantId).single());
          }
          if (product) {
            if (!desc) desc = product.name;
            if (unitPrice == null) unitPrice = Number(product.price);
            if (product.tax_percent != null) productTaxPercent = Number(product.tax_percent);
            if (product.hsn_sac_code) hsnSacCode = String(product.hsn_sac_code).trim().slice(0, 20) || null;
            costPrice = product.last_purchase_price != null ? Number(product.last_purchase_price) : 0;
            prodCompany = product.company || null;
            prodRamStorage = product.ram_storage || null;
            prodImei = product.imei || null;
            prodColor = product.color || null;
          }
        }
        // Extra fields are always pulled from the product (read-only on invoices)
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
          company: prodCompany,
          ram_storage: prodRamStorage,
          imei: prodImei,
          color: prodColor,
        });
      }
      const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
      const taxAmount = Math.round(items.reduce((s, i) => s + i.cgst_amount + i.sgst_amount + i.igst_amount, 0) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;
      const effectiveTaxPercent = subtotal > 0 ? Math.round(taxAmount / subtotal * 10000) / 100 : tenantTaxPercent;

      await supabase.from('invoice_items').delete().eq('invoice_id', id);
      const { data: invoice, error: updateErr } = await supabase
        .from('invoices')
        .update({ customer_id: customerId, invoice_date: invoiceDate, subtotal, tax_percent: effectiveTaxPercent, tax_amount: taxAmount, total, gst_type: gstType, status: newStatus })
        .eq('id', id)
        .eq('tenant_id', req.tenantId)
        .select()
        .single();
      if (updateErr) {
        console.error(updateErr);
        return res.status(500).json({ error: 'Failed to update invoice' });
      }
      const itemRow = (it, includeCost, includeExtras) => {
        const row = {
          invoice_id: id,
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
        if (includeExtras) {
          row.company = it.company || null;
          row.ram_storage = it.ram_storage || null;
          row.imei = it.imei || null;
          row.color = it.color || null;
        }
        return row;
      };
      for (const it of items) {
        let { error: itemErr } = await supabase.from('invoice_items').insert(itemRow(it, true, true));
        if (itemErr && String(itemErr.message || '').includes('does not exist')) {
          ({ error: itemErr } = await supabase.from('invoice_items').insert(itemRow(it, true, false)));
        }
        if (itemErr && String(itemErr.message || '').includes('does not exist')) {
          ({ error: itemErr } = await supabase.from('invoice_items').insert(itemRow(it, false, false)));
        }
        if (itemErr) {
          console.error(itemErr);
          return res.status(500).json({ error: 'Failed to update invoice items' });
        }
      }
      // Deduct stock if status changed to 'sent'
      if (newStatus === 'sent') {
        const serialIds = body.serialIds || {};
        await deductStock(req.tenantId, id, items, serialIds);
      }

      const { data: itemsData } = await supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at');
      return res.json({ ...invoice, invoice_items: itemsData || [] });
    }

    // Status-only update
    const status = (body.status ?? '').toString().toLowerCase();
    if (!['sent', 'paid'].includes(status)) return res.status(400).json({ error: 'status must be sent or paid' });
    const { data: existing, error: fetchErr } = await supabase
      .from('invoices')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Invoice not found' });
    const allowed = ALLOWED_NEXT[existing.status];
    if (!allowed || !allowed.includes(status)) return res.status(400).json({ error: `Cannot change status from ${existing.status} to ${status}` });
    const { data: updated, error: updateErr } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (updateErr) {
      console.error(updateErr);
      return res.status(500).json({ error: 'Failed to update invoice status' });
    }

    // Deduct stock when moving from draft to sent
    if (existing.status === 'draft' && (status === 'sent' || status === 'paid')) {
      const { data: invItems } = await supabase
        .from('invoice_items')
        .select('product_id, quantity, cost_price')
        .eq('invoice_id', id);
      if (invItems && invItems.length > 0) {
        const serialIds = body.serialIds || {};
        await deductStock(req.tenantId, id, invItems, serialIds);
      }
    }

    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: existing, error: fetchErr } = await supabase
      .from('invoices')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Invoice not found' });
    if (existing.status === 'paid') return res.status(400).json({ error: 'Paid invoices cannot be deleted' });
    const { error: delErr } = await supabase.from('invoices').delete().eq('id', id).eq('tenant_id', req.tenantId);
    if (delErr) {
      console.error(delErr);
      return res.status(500).json({ error: 'Failed to delete invoice' });
    }
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /cleanup-drafts
 * Delete draft invoices older than N days (default 30).
 * Useful as a scheduled task or manual trigger.
 */
router.post('/cleanup-drafts', async (req, res, next) => {
  try {
    const days = Math.max(1, parseInt(req.body?.days, 10) || 30);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error: err } = await supabase
      .from('invoices')
      .delete()
      .eq('tenant_id', req.tenantId)
      .eq('status', 'draft')
      .lt('created_at', cutoff)
      .select('id');
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to cleanup drafts' });
    }
    return res.json({ deleted: (data || []).length });
  } catch (err) {
    next(err);
  }
});

export default router;
