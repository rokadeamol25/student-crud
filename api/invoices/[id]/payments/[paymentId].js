import { supabase } from '../../../_lib/supabase.js';
import { requireAuth } from '../../../_lib/auth.js';

async function recomputeInvoiceAmountPaid(supabaseClient, invoiceId, tenantId) {
  const { data: rows } = await supabaseClient
    .from('payments')
    .select('amount')
    .eq('invoice_id', invoiceId);
  const amountPaid = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const rounded = Math.round(amountPaid * 100) / 100;
  const { data: inv } = await supabaseClient
    .from('invoices')
    .select('total')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  const total = Number(inv?.total) || 0;
  const status = rounded >= total ? 'paid' : 'sent';
  await supabaseClient
    .from('invoices')
    .update({ amount_paid: rounded, status })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const invoiceId = req.query.id;
  const paymentId = req.query.paymentId;
  if (!invoiceId || !paymentId) return res.status(400).json({ error: 'Invoice id and payment id required' });
  const tenantId = auth.tenantId;

  try {
    if (req.method === 'DELETE') {
      const { data: payment, error: fetchErr } = await supabase
        .from('payments')
        .select('id')
        .eq('id', paymentId)
        .eq('invoice_id', invoiceId)
        .eq('tenant_id', tenantId)
        .single();
      if (fetchErr || !payment) return res.status(404).json({ error: 'Payment not found' });

      const { error: delErr } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId)
        .eq('tenant_id', tenantId);
      if (delErr) {
        console.error(delErr);
        return res.status(500).json({ error: 'Failed to delete payment' });
      }
      await recomputeInvoiceAmountPaid(supabase, invoiceId, tenantId);
      return res.status(204).end();
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Delete payment handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
