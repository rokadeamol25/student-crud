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

async function getNextPurchaseBillNumber(tenantId) {
  const { data: row, error } = await supabase
    .from('tenants')
    .select('purchase_bill_prefix, purchase_bill_next_number')
    .eq('id', tenantId)
    .single();
  if (error || !row) {
    const prefix = 'PB-';
    const next = 1;
    return { billNumber: `${prefix}${String(next).padStart(4, '0')}`, nextNumber: next };
  }
  const prefix = (row.purchase_bill_prefix ?? 'PB-').toString().trim() || 'PB-';
  const next = Math.max(1, parseInt(row.purchase_bill_next_number, 10) || 1);
  const billNumber = `${prefix}${String(next).padStart(4, '0')}`;
  return { billNumber, nextNumber: next };
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
    let billNumber = (body.bill_number ?? body.billNumber ?? '').toString().trim();
    const autoNumber = !billNumber;
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

    let bill = null;
    let billErr = null;
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (autoNumber) {
        const next = await getNextPurchaseBillNumber(req.tenantId);
        billNumber = next.billNumber;
      }
      const { data: inserted, error: insertErr } = await supabase
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
      billErr = insertErr;
      bill = inserted;
      if (!insertErr) {
        if (autoNumber) {
          const next = await getNextPurchaseBillNumber(req.tenantId);
          await supabase.from('tenants').update({ purchase_bill_next_number: next.nextNumber + 1 }).eq('id', req.tenantId);
        }
        break;
      }
      if (insertErr.code === '23505' && autoNumber && attempt < maxAttempts - 1) {
        const { data: tenantRow } = await supabase.from('tenants').select('purchase_bill_next_number').eq('id', req.tenantId).single();
        const nextNum = Math.max(1, (tenantRow?.purchase_bill_next_number || 1) + 1);
        await supabase.from('tenants').update({ purchase_bill_next_number: nextNum }).eq('id', req.tenantId);
        continue;
      }
      break;
    }
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
    const rawItems = items || [];
    const itemIds = rawItems.map((i) => i.id);
    const productIds = [...new Set(rawItems.map((i) => i.product_id).filter(Boolean))];

    const [productsRes, serialsRes, batchesRes] = await Promise.all([
      productIds.length ? supabase.from('products').select('id, name, tracking_type').in('id', productIds) : { data: [] },
      itemIds.length ? supabase.from('product_serials').select('id, serial_number, purchase_bill_item_id').in('purchase_bill_item_id', itemIds).order('created_at') : { data: [] },
      itemIds.length ? supabase.from('product_batches').select('id, batch_number, expiry_date, quantity, purchase_bill_item_id').in('purchase_bill_item_id', itemIds).order('created_at') : { data: [] },
    ]);

    const productsById = {};
    (productsRes.data || []).forEach((p) => { productsById[p.id] = p; });
    const serialsByItemId = {};
    (serialsRes.data || []).forEach((s) => {
      const key = s.purchase_bill_item_id;
      if (!key) return;
      if (!serialsByItemId[key]) serialsByItemId[key] = [];
      serialsByItemId[key].push({ id: s.id, serial_number: s.serial_number });
    });
    const batchesByItemId = {};
    (batchesRes.data || []).forEach((b) => {
      const key = b.purchase_bill_item_id;
      if (!key) return;
      if (!batchesByItemId[key]) batchesByItemId[key] = [];
      batchesByItemId[key].push({ id: b.id, batch_number: b.batch_number, expiry_date: b.expiry_date, quantity: b.quantity });
    });

    const enrichedItems = rawItems.map((it) => ({
      ...it,
      product: productsById[it.product_id] || null,
      serials: serialsByItemId[it.id] || [],
      batches: batchesByItemId[it.id] || [],
    }));

    const supplier = Array.isArray(bill.suppliers) ? bill.suppliers[0] : bill.suppliers;
    const amountPaid = Number(bill.amount_paid) || 0;
    const total = Number(bill.total) || 0;
    const balance = Math.round((total - amountPaid) * 100) / 100;
    const { suppliers: _s, ...rest } = bill;
    return res.json({
      ...rest,
      supplier: supplier || null,
      items: enrichedItems,
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

/**
 * POST /:id/record
 * Records a purchase bill: updates stock based on product tracking_type.
 * Body can include:
 *   serials: { [product_id]: ["IMEI1","IMEI2",...] }
 *   batches: { [product_id]: { batch_number, expiry_date } }
 */
router.post('/:id/record', async (req, res, next) => {
  try {
    const billId = req.params.id;
    const body = req.body || {};
    const serialsMap = body.serials || {}; // product_id -> string[]
    const batchesMap = body.batches || {}; // product_id -> { batch_number, expiry_date }

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
      .select('id, product_id, quantity, purchase_price')
      .eq('purchase_bill_id', billId)
      .order('created_at');
    if (itemsErr || !items || items.length === 0) {
      return res.status(400).json({ error: 'Purchase bill has no items' });
    }

    // Aggregate by product
    const byProduct = new Map();
    for (const item of items) {
      const pid = item.product_id;
      const qty = Number(item.quantity);
      const price = Number(item.purchase_price);
      if (!byProduct.has(pid)) byProduct.set(pid, { quantity: 0, purchase_price: price, items: [] });
      const agg = byProduct.get(pid);
      agg.quantity += qty;
      agg.purchase_price = price;
      agg.items.push(item);
    }

    for (const [productId, agg] of byProduct) {
      const { data: prod } = await supabase.from('products').select('stock, tracking_type').eq('id', productId).single();
      if (!prod) continue;
      const currentStock = Number(prod.stock) || 0;
      const trackingType = prod.tracking_type || 'quantity';

      // --- SERIAL PRODUCTS ---
      if (trackingType === 'serial') {
        const serials = serialsMap[productId] || [];
        if (serials.length !== agg.quantity) {
          return res.status(400).json({
            error: `Product requires ${agg.quantity} serial number(s) but got ${serials.length}`,
          });
        }
        // Check uniqueness
        const uniqueSet = new Set(serials.map((s) => s.trim().toUpperCase()));
        if (uniqueSet.size !== serials.length) {
          return res.status(400).json({ error: 'Duplicate serial numbers in the same purchase' });
        }
        for (const sn of serials) {
          const trimmed = sn.trim();
          if (!trimmed) return res.status(400).json({ error: 'Serial number cannot be empty' });
          // Check DB uniqueness
          const { data: existing } = await supabase
            .from('product_serials')
            .select('id')
            .eq('tenant_id', req.tenantId)
            .eq('serial_number', trimmed)
            .limit(1);
          if (existing && existing.length > 0) {
            return res.status(409).json({ error: `Serial number "${trimmed}" already exists` });
          }
          const { data: serialRow, error: sErr } = await supabase
            .from('product_serials')
            .insert({
              tenant_id: req.tenantId,
              product_id: productId,
              serial_number: trimmed,
              status: 'available',
              purchase_bill_item_id: agg.items[0]?.id || null,
              cost_price: agg.purchase_price,
            })
            .select('id')
            .single();
          if (sErr) {
            console.error(sErr);
            return res.status(500).json({ error: `Failed to create serial "${trimmed}"` });
          }
          // Stock movement for each serial
          await supabase.from('stock_movements').insert({
            tenant_id: req.tenantId,
            product_id: productId,
            movement_type: 'purchase',
            direction: 'in',
            quantity: 1,
            reference_type: 'purchase_bill',
            reference_id: billId,
            serial_id: serialRow?.id || null,
            cost_price: agg.purchase_price,
          });
        }
      }

      // --- BATCH PRODUCTS ---
      else if (trackingType === 'batch') {
        const batchInfo = batchesMap[productId];
        if (!batchInfo || !batchInfo.batch_number) {
          return res.status(400).json({ error: `Batch number is required for product "${productId}"` });
        }
        const batchNumber = batchInfo.batch_number.toString().trim();
        const expiryDate = batchInfo.expiry_date || null;

        // Upsert: top up if batch already exists
        const { data: existingBatch } = await supabase
          .from('product_batches')
          .select('id, quantity')
          .eq('tenant_id', req.tenantId)
          .eq('product_id', productId)
          .eq('batch_number', batchNumber)
          .single();

        let batchId;
        if (existingBatch) {
          const newQty = Number(existingBatch.quantity) + agg.quantity;
          await supabase.from('product_batches').update({ quantity: newQty, cost_price: agg.purchase_price }).eq('id', existingBatch.id);
          batchId = existingBatch.id;
        } else {
          const { data: newBatch, error: bErr } = await supabase
            .from('product_batches')
            .insert({
              tenant_id: req.tenantId,
              product_id: productId,
              batch_number: batchNumber,
              expiry_date: expiryDate,
              quantity: agg.quantity,
              cost_price: agg.purchase_price,
              purchase_bill_item_id: agg.items[0]?.id || null,
            })
            .select('id')
            .single();
          if (bErr) {
            console.error(bErr);
            return res.status(500).json({ error: 'Failed to create batch' });
          }
          batchId = newBatch?.id || null;
        }
        // Stock movement
        await supabase.from('stock_movements').insert({
          tenant_id: req.tenantId,
          product_id: productId,
          movement_type: 'purchase',
          direction: 'in',
          quantity: agg.quantity,
          reference_type: 'purchase_bill',
          reference_id: billId,
          batch_id: batchId,
          cost_price: agg.purchase_price,
        });
      }

      // --- QUANTITY PRODUCTS ---
      else {
        // Stock movement
        await supabase.from('stock_movements').insert({
          tenant_id: req.tenantId,
          product_id: productId,
          movement_type: 'purchase',
          direction: 'in',
          quantity: agg.quantity,
          reference_type: 'purchase_bill',
          reference_id: billId,
          cost_price: agg.purchase_price,
        });
      }

      // Update product stock (all types)
      const { error: upErr } = await supabase
        .from('products')
        .update({ stock: currentStock + agg.quantity, last_purchase_price: agg.purchase_price, updated_at: new Date().toISOString() })
        .eq('id', productId);
      if (upErr) {
        console.error(upErr);
        return res.status(500).json({ error: 'Failed to update product stock' });
      }

      // Backfill cost on existing invoice items where cost_price is 0
      try {
        const { data: zeroItems } = await supabase
          .from('invoice_items')
          .select('id, quantity')
          .eq('product_id', productId)
          .eq('cost_price', 0);
        if (zeroItems && zeroItems.length > 0) {
          for (const item of zeroItems) {
            const costAmount = Math.round(Number(item.quantity) * agg.purchase_price * 100) / 100;
            await supabase
              .from('invoice_items')
              .update({ cost_price: agg.purchase_price, cost_amount: costAmount })
              .eq('id', item.id);
          }
        }
      } catch (backfillErr) {
        console.error('Cost backfill warning:', backfillErr.message);
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
