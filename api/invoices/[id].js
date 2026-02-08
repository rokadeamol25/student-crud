import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

const ALLOWED_NEXT = { draft: ['sent'], sent: ['paid'], paid: [] };

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
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Invoice id required' });

  try {
    if (req.method === 'GET') {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*, customers(id, name, email, phone, address)')
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .single();
      if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

      const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at');
      const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
      const { customers: _c, ...inv } = invoice;
      return res.json({ ...inv, customer: customer || null, invoice_items: items || [] });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const status = (body.status ?? '').toString().toLowerCase();
      if (!['sent', 'paid'].includes(status)) {
        return res.status(400).json({ error: 'status must be sent or paid' });
      }
      const { data: existing, error: fetchErr } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .single();
      if (fetchErr || !existing) return res.status(404).json({ error: 'Invoice not found' });
      const allowed = ALLOWED_NEXT[existing.status];
      if (!allowed || !allowed.includes(status)) {
        return res.status(400).json({ error: `Cannot change status from ${existing.status} to ${status}` });
      }
      const { data: updated, error: updateErr } = await supabase
        .from('invoices')
        .update({ status })
        .eq('id', id)
        .eq('tenant_id', auth.tenantId)
        .select()
        .single();
      if (updateErr) {
        console.error(updateErr);
        return res.status(500).json({ error: 'Failed to update invoice status' });
      }
      return res.json(updated);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Invoices [id] handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
