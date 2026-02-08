import { supabase } from '../../api/_lib/supabase.js';
import { requireAuth } from '../../api/_lib/auth.js';

async function recomputePurchaseBillAmountPaid(supabaseClient, billId, tenantId) {
  const { data: rows } = await supabaseClient
    .from('purchase_payments')
    .select('amount')
    .eq('purchase_bill_id', billId);
  const amountPaid = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const rounded = Math.round(amountPaid * 100) / 100;
  await supabaseClient
    .from('purchase_bills')
    .update({ amount_paid: rounded })
    .eq('id', billId)
    .eq('tenant_id', tenantId);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const billId = req.query.id;
  const paymentId = req.query.paymentId;
  if (!billId || !paymentId) return res.status(400).json({ error: 'Purchase bill id and payment id required' });
  const tenantId = auth.tenantId;

  try {
    if (req.method === 'DELETE') {
      const { data: payment, error: fetchErr } = await supabase
        .from('purchase_payments')
        .select('id')
        .eq('id', paymentId)
        .eq('purchase_bill_id', billId)
        .eq('tenant_id', tenantId)
        .single();
      if (fetchErr || !payment) return res.status(404).json({ error: 'Payment not found' });

      const { error: delErr } = await supabase
        .from('purchase_payments')
        .delete()
        .eq('id', paymentId)
        .eq('tenant_id', tenantId);
      if (delErr) {
        console.error(delErr);
        return res.status(500).json({ error: 'Failed to delete payment' });
      }
      await recomputePurchaseBillAmountPaid(supabase, billId, tenantId);
      return res.status(204).end();
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Delete purchase payment handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
