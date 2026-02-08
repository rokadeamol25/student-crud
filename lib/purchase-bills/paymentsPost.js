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
  return rounded;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const billId = req.query.id;
  if (!billId) return res.status(400).json({ error: 'Purchase bill id required' });
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

      const { data: bill, error: billErr } = await supabase
        .from('purchase_bills')
        .select('id, total, amount_paid')
        .eq('id', billId)
        .eq('tenant_id', tenantId)
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
          tenant_id: tenantId,
          purchase_bill_id: billId,
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
      await recomputePurchaseBillAmountPaid(supabase, billId, tenantId);
      return res.status(201).json(payment);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Purchase payments handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
