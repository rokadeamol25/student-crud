import { supabase } from '../../api/_lib/supabase.js';
import { requireAuth } from '../../api/_lib/auth.js';

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
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const tenantId = auth.tenantId;

  try {
    if (req.method === 'POST') {
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
      const { data: products } = await supabase.from('products').select('id').eq('tenant_id', tenantId).in('id', items.map((i) => i.product_id));
      const productIds = (products || []).map((p) => p.id);
      if (items.some((i) => !productIds.includes(i.product_id))) {
        return res.status(400).json({ error: 'All products must belong to your shop' });
      }

      const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
      const total = subtotal;

      const { data: bill, error: billErr } = await supabase
        .from('purchase_bills')
        .insert({
          tenant_id: tenantId,
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
    }

    if (req.method === 'GET') {
      let q = supabase
        .from('purchase_bills')
        .select('*, suppliers(id, name)', { count: 'exact' })
        .eq('tenant_id', tenantId)
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
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Purchase bills handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
