/**
 * Purchase bills API: list, get one, create draft, update draft, delete draft,
 * record (update stock + last_purchase_price), payments. All tenant-scoped.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer'];

async function recomputePurchaseBillAmountPaid(billId, tenantId) {
  const { data: rows } = await supabase
    .from('purchase_payments')
    .select('amount')
    .eq('purchase_bill_id', billId);
  const amountPaid = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const rounded = Math.round(amountPaid * 100) / 100;
  await supabase
    .from('purchase_bills')
    .update({ amount_paid: rounded })
    .eq('id', billId)
    .eq('tenant_id', tenantId);
}

router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('purchase_bills')
      .select('*, suppliers(id, name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('bill_date', { ascending: false });
    const supplierId = (req.query?.supplier_id ?? req.query?.supplierId ?? '').toString().trim();
    if (supplierId) q = q.eq('supplier_id', supplierId);
    const status = (req.query?.status ?? '').toString().trim();
    if (status) q = q.eq('status', status);
    const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 100);
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to list purchase bills' });
    }
    const list = (data || []).map((row) => {
      const { suppliers: s, ...rest } = row;
      const supplier = Array.isArray(s) ? s[0] : s;
      return { ...rest, supplier: supplier || null };
    });
    return res.json({ data: list, total: count ?? list.length });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const supplierId = (body.supplier_id ?? body.supplierId ?? '').toString().trim();
    if (!supplierId) return res.status(400).json({ error: 'supplier_id is required' });
    const billNumber = (body.bill_number ?? body.billNumber ?? '').toString().trim();
    if (!billNumber) return res.status(400).json({ error: 'bill_number is required' });
    const billDate = (body.bill_date ?? body.billDate ?? '').toString().trim();
    if (!billDate) return res.status(400).json({ error: 'bill_date is required' });
    if (Number.isNaN(new Date(billDate).getTime())) return res.status(400).json({ error: 'bill_date must be a valid date' });
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ error: 'items array is required and non-empty' });

    const { data: supplier } = await supabase.from('suppliers').select('id').eq('id', supplierId).eq('tenant_id', req.tenantId).single();
    if (!supplier) return res.status(400).json({ error: 'Supplier not found or does not belong to your shop' });

    const items = [];
    for (let i = 0; i < rawItems.length; i++) {
      const row = rawItems[i];
      const productId = (row.product_id ?? row.productId ?? '').toString().trim();
      if (!productId) return res.status(400).json({ error: `items[${i}].product_id is required` });
      const qty = Number(row.quantity);
      if (Number.isNaN(qty) || qty <= 0) return res.status(400).json({ error: `items[${i}].quantity must be > 0` });
      const purchasePrice = Number(row.purchase_price ?? row.purchasePrice);
      if (Number.isNaN(purchasePrice) || purchasePrice < 0) return res.status(400).json({ error: `items[${i}].purchase_price must be >= 0` });
      const amount = Math.round(qty * purchasePrice * 100) / 100;
      items.push({ product_id: productId, quantity: qty, purchase_price: purchasePrice, amount });
    }
    const { data: products } = await supabase.from('products').select('id').eq('tenant_id', req.tenantId).in('id', items.map((i) => i.product_id));
    const productIds = (products || []).map((p) => p.id);
    if (items.some((i) => !productIds.includes(i.product_id))) {
      return res.status(400).json({ error: 'All products must belong to your shop' });
    }

    const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const total = subtotal;

    const { data: bill, error: billErr } = await supabase
      .from('purchase_bills')
      .insert({
        tenant_id: req.tenantId,
        supplier_id: supplierId,
        bill_number: billNumber,
        bill_date: billDate,
        status: 'draft',
        subtotal,
        total,
      })
      .select()
      .single();
    if (billErr) {
      if (billErr.code === '23505') return res.status(400).json({ error: 'Bill number already exists for this tenant' });
      console.error(billErr);
      return res.status(500).json({ error: 'Failed to create purchase bill' });
    }
    for (const it of items) {
      const { error: itemErr } = await supabase.from('purchase_bill_items').insert({
        purchase_bill_id: bill.id,
        product_id: it.product_id,
        quantity: it.quantity,
        purchase_price: it.purchase_price,
        amount: it.amount,
      });
      if (itemErr) {
        console.error(itemErr);
        await supabase.from('purchase_bills').delete().eq('id', bill.id);
        return res.status(500).json({ error: 'Failed to create purchase bill items' });
      }
    }
    const { data: itemsData } = await supabase.from('purchase_bill_items').select('*').eq('purchase_bill_id', bill.id).order('created_at');
    const { data: supplierRow } = await supabase.from('suppliers').select('id, name').eq('id', supplierId).single();
    return res.status(201).json({ ...bill, supplier: supplierRow || null, items: itemsData || [] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: bill, error } = await supabase
      .from('purchase_bills')
      .select('*, suppliers(id, name, email, phone, address)')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !bill) return res.status(404).json({ error: 'Purchase bill not found' });
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from('purchase_bill_items').select('*').eq('purchase_bill_id', id).order('created_at'),
      supabase.from('purchase_payments').select('*').eq('purchase_bill_id', id).eq('tenant_id', req.tenantId).order('paid_at').order('created_at'),
    ]);
    const supplier = Array.isArray(bill.suppliers) ? bill.suppliers[0] : bill.suppliers;
    const amountPaid = Number(bill.amount_paid) || 0;
    const total = Number(bill.total) || 0;
    const balance = Math.round((total - amountPaid) * 100) / 100;
    const { suppliers: _s, ...rest } = bill;
    return res.json({
      ...rest,
      supplier: supplier || null,
      items: items || [],
      payments: payments || [],
      amount_paid: amountPaid,
      balance,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: existing } = await supabase.from('purchase_bills').select('status').eq('id', id).eq('tenant_id', req.tenantId).single();
    if (!existing) return res.status(404).json({ error: 'Purchase bill not found' });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft purchase bills can be edited' });

    const body = req.body || {};
    const supplierId = (body.supplier_id ?? body.supplierId ?? '').toString().trim();
    if (!supplierId) return res.status(400).json({ error: 'supplier_id is required' });
    const billNumber = (body.bill_number ?? body.billNumber ?? '').toString().trim();
    if (!billNumber) return res.status(400).json({ error: 'bill_number is required' });
    const billDate = (body.bill_date ?? body.billDate ?? '').toString().trim();
    if (!billDate) return res.status(400).json({ error: 'bill_date is required' });
    if (Number.isNaN(new Date(billDate).getTime())) return res.status(400).json({ error: 'bill_date must be a valid date' });
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ error: 'items array is required and non-empty' });

    const { data: supplier } = await supabase.from('suppliers').select('id').eq('id', supplierId).eq('tenant_id', req.tenantId).single();
    if (!supplier) return res.status(400).json({ error: 'Supplier not found' });

    const items = [];
    for (let i = 0; i < rawItems.length; i++) {
      const row = rawItems[i];
      const productId = (row.product_id ?? row.productId ?? '').toString().trim();
      if (!productId) return res.status(400).json({ error: `items[${i}].product_id is required` });
      const qty = Number(row.quantity);
      if (Number.isNaN(qty) || qty <= 0) return res.status(400).json({ error: `items[${i}].quantity must be > 0` });
      const purchasePrice = Number(row.purchase_price ?? row.purchasePrice);
      if (Number.isNaN(purchasePrice) || purchasePrice < 0) return res.status(400).json({ error: `items[${i}].purchase_price must be >= 0` });
      const amount = Math.round(qty * purchasePrice * 100) / 100;
      items.push({ product_id: productId, quantity: qty, purchase_price: purchasePrice, amount });
    }
    const { data: products } = await supabase.from('products').select('id').eq('tenant_id', req.tenantId).in('id', items.map((i) => i.product_id));
    const productIds = (products || []).map((p) => p.id);
    if (items.some((i) => !productIds.includes(i.product_id))) return res.status(400).json({ error: 'All products must belong to your shop' });

    const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const total = subtotal;

    const { error: delItemsErr } = await supabase.from('purchase_bill_items').delete().eq('purchase_bill_id', id);
    if (delItemsErr) {
      console.error(delItemsErr);
      return res.status(500).json({ error: 'Failed to update purchase bill' });
    }
    const { data: bill, error: updateErr } = await supabase
      .from('purchase_bills')
      .update({ supplier_id: supplierId, bill_number: billNumber, bill_date: billDate, subtotal, total })
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (updateErr) {
      if (updateErr.code === '23505') return res.status(400).json({ error: 'Bill number already exists' });
      console.error(updateErr);
      return res.status(500).json({ error: 'Failed to update purchase bill' });
    }
    for (const it of items) {
      await supabase.from('purchase_bill_items').insert({
        purchase_bill_id: id,
        product_id: it.product_id,
        quantity: it.quantity,
        purchase_price: it.purchase_price,
        amount: it.amount,
      });
    }
    const { data: itemsData } = await supabase.from('purchase_bill_items').select('*').eq('purchase_bill_id', id).order('created_at');
    const { data: supplierRow } = await supabase.from('suppliers').select('id, name').eq('id', supplierId).single();
    return res.json({ ...bill, supplier: supplierRow || null, items: itemsData || [] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: existing } = await supabase.from('purchase_bills').select('status').eq('id', id).eq('tenant_id', req.tenantId).single();
    if (!existing) return res.status(404).json({ error: 'Purchase bill not found' });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft purchase bills can be deleted' });
    const { error } = await supabase.from('purchase_bills').delete().eq('id', id).eq('tenant_id', req.tenantId);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to delete purchase bill' });
    }
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/record', async (req, res, next) => {
  try {
    const billId = req.params.id;
    const { data: bill, error: billErr } = await supabase
      .from('purchase_bills')
      .select('id, status')
      .eq('id', billId)
      .eq('tenant_id', req.tenantId)
      .single();
    if (billErr || !bill) return res.status(404).json({ error: 'Purchase bill not found' });
    if (bill.status !== 'draft') return res.status(400).json({ error: 'Only draft bills can be recorded' });

    const { data: items, error: itemsErr } = await supabase
      .from('purchase_bill_items')
      .select('product_id, quantity, purchase_price')
      .eq('purchase_bill_id', billId)
      .order('created_at');
    if (itemsErr || !items || items.length === 0) {
      return res.status(400).json({ error: 'Purchase bill has no items' });
    }
    const byProduct = new Map();
    for (const item of items) {
      const pid = item.product_id;
      const qty = Number(item.quantity);
      const price = Number(item.purchase_price);
      if (!byProduct.has(pid)) byProduct.set(pid, { quantity: 0, purchase_price: price });
      const agg = byProduct.get(pid);
      agg.quantity += qty;
      agg.purchase_price = price;
    }
    for (const [productId, agg] of byProduct) {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', productId).single();
      const currentStock = Number(prod?.stock) || 0;
      const { error: upErr } = await supabase
        .from('products')
        .update({ stock: currentStock + agg.quantity, last_purchase_price: agg.purchase_price })
        .eq('id', productId);
      if (upErr) {
        console.error(upErr);
        return res.status(500).json({ error: 'Failed to update product stock' });
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from('purchase_bills')
      .update({ status: 'recorded' })
      .eq('id', billId)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (updateErr) {
      console.error(updateErr);
      return res.status(500).json({ error: 'Failed to record purchase bill' });
    }
    const { data: itemsData } = await supabase.from('purchase_bill_items').select('*').eq('purchase_bill_id', billId).order('created_at');
    const { data: supplier } = await supabase.from('suppliers').select('id, name').eq('id', updated.supplier_id).single();
    return res.json({ ...updated, supplier: supplier || null, items: itemsData || [] });
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

    const { data: bill, error: billErr } = await supabase
      .from('purchase_bills')
      .select('id, total, amount_paid')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (billErr || !bill) return res.status(404).json({ error: 'Purchase bill not found' });
    const total = Number(bill.total) || 0;
    const amountPaid = Number(bill.amount_paid) || 0;
    const balance = Math.round((total - amountPaid) * 100) / 100;
    if (amount > balance) {
      return res.status(400).json({ error: `Amount exceeds balance due (${balance})` });
    }

    const amountRounded = Math.round(amount * 100) / 100;
    const { data: payment, error: insertErr } = await supabase
      .from('purchase_payments')
      .insert({
        tenant_id: req.tenantId,
        purchase_bill_id: id,
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
    await recomputePurchaseBillAmountPaid(id, req.tenantId);
    return res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/payments/:paymentId', async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;
    const { data: payment, error: fetchErr } = await supabase
      .from('purchase_payments')
      .select('id')
      .eq('id', paymentId)
      .eq('purchase_bill_id', id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (fetchErr || !payment) return res.status(404).json({ error: 'Payment not found' });
    const { error: delErr } = await supabase.from('purchase_payments').delete().eq('id', paymentId).eq('tenant_id', req.tenantId);
    if (delErr) {
      console.error(delErr);
      return res.status(500).json({ error: 'Failed to delete payment' });
    }
    await recomputePurchaseBillAmountPaid(id, req.tenantId);
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
