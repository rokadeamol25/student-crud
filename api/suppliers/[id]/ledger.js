import { supabase } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const supplierId = req.query.id;
  if (!supplierId) return res.status(400).json({ error: 'Supplier id required' });
  const tenantId = auth.tenantId;

  try {
    const { data: supplier, error: supErr } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('id', supplierId)
      .eq('tenant_id', tenantId)
      .single();
    if (supErr || !supplier) return res.status(404).json({ error: 'Supplier not found' });

    const { data: bills, error: billsErr } = await supabase
      .from('purchase_bills')
      .select('id, bill_number, bill_date, status, total, amount_paid')
      .eq('supplier_id', supplierId)
      .eq('tenant_id', tenantId)
      .order('bill_date', { ascending: false });
    if (billsErr) {
      console.error(billsErr);
      return res.status(500).json({ error: 'Failed to load ledger' });
    }
    const list = bills || [];
    const recorded = list.filter((b) => b.status === 'recorded');
    const totalPurchases = recorded.reduce((s, b) => s + Number(b.total || 0), 0);
    const totalPaid = recorded.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
    const balancePayable = Math.round((totalPurchases - totalPaid) * 100) / 100;

    return res.json({
      supplier: { id: supplier.id, name: supplier.name },
      totalPurchases: Math.round(totalPurchases * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      balancePayable,
      bills: list.map((b) => ({
        id: b.id,
        bill_number: b.bill_number,
        bill_date: b.bill_date,
        status: b.status,
        total: Number(b.total),
        amount_paid: Number(b.amount_paid),
        balance: Math.round((Number(b.total) - Number(b.amount_paid)) * 100) / 100,
      })),
    });
  } catch (err) {
    console.error('Supplier ledger error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
