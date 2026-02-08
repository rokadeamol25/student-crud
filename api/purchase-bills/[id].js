import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

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
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Purchase bill id required' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const tenantId = auth.tenantId;

  try {
    if (req.method === 'GET') {
      const { data: bill, error } = await supabase
        .from('purchase_bills')
        .select('*, suppliers(id, name, email, phone, address)')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (error || !bill) return res.status(404).json({ error: 'Purchase bill not found' });
      const [{ data: items }, { data: payments }] = await Promise.all([
        supabase.from('purchase_bill_items').select('*').eq('purchase_bill_id', id).order('created_at'),
        supabase.from('purchase_payments').select('*').eq('purchase_bill_id', id).eq('tenant_id', tenantId).order('paid_at').order('created_at'),
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
    }

    if (req.method === 'PATCH') {
      const { data: existing } = await supabase.from('purchase_bills').select('status').eq('id', id).eq('tenant_id', tenantId).single();
      if (!existing) return res.status(404).json({ error: 'Purchase bill not found' });
      if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft purchase bills can be edited' });

      const body = parseBody(req);
      const supplierId = (body.supplier_id ?? body.supplierId ?? '').toString().trim();
      if (!supplierId) return res.status(400).json({ error: 'supplier_id is required' });
      const billNumber = (body.bill_number ?? body.billNumber ?? '').toString().trim();
      if (!billNumber) return res.status(400).json({ error: 'bill_number is required' });
      const billDate = (body.bill_date ?? body.billDate ?? '').toString().trim();
      if (!billDate) return res.status(400).json({ error: 'bill_date is required' });
      if (Number.isNaN(new Date(billDate).getTime())) return res.status(400).json({ error: 'bill_date must be a valid date' });
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) return res.status(400).json({ error: 'items array is required and non-empty' });

      const { data: supplier } = await supabase.from('suppliers').select('id').eq('id', supplierId).eq('tenant_id', tenantId).single();
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
      const { data: products } = await supabase.from('products').select('id').eq('tenant_id', tenantId).in('id', items.map((i) => i.product_id));
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
        .eq('tenant_id', tenantId)
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
    }

    if (req.method === 'DELETE') {
      const { data: existing } = await supabase.from('purchase_bills').select('status').eq('id', id).eq('tenant_id', tenantId).single();
      if (!existing) return res.status(404).json({ error: 'Purchase bill not found' });
      if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft purchase bills can be deleted' });
      const { error } = await supabase.from('purchase_bills').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to delete purchase bill' });
      }
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Purchase bill [id] handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
