import { supabase } from '../../api/_lib/supabase.js';
import { requireAuth } from '../../api/_lib/auth.js';

const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer'];

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
  return { amount_paid: rounded, status };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const invoiceId = req.query.id;
  if (!invoiceId) return res.status(400).json({ error: 'Invoice id required' });
  const tenantId = auth.tenantId;

  try {
    if (req.method === 'POST') {
      const body = parseBody(req);
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
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
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
          tenant_id: tenantId,
          invoice_id: invoiceId,
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
      await recomputeInvoiceAmountPaid(supabase, invoiceId, tenantId);
      return res.status(201).json(payment);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Payments handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
