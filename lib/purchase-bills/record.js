import { supabase } from '../../api/_lib/supabase.js';
import { requireAuth } from '../../api/_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const billId = req.query.id;
  if (!billId) return res.status(400).json({ error: 'Purchase bill id required' });
  const tenantId = auth.tenantId;

  try {
    const { data: bill, error: billErr } = await supabase
      .from('purchase_bills')
      .select('id, status')
      .eq('id', billId)
      .eq('tenant_id', tenantId)
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
      .eq('tenant_id', tenantId)
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
    console.error('Record purchase bill error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
