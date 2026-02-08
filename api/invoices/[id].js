import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Invoice id required' });

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
