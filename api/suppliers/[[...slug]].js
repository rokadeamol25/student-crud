/**
 * Consolidated /api/suppliers, /api/suppliers/[id], /api/suppliers/[id]/ledger — one serverless function.
 */
import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

function getSlug(req) {
  const slug = req.query?.slug;
  if (Array.isArray(slug)) return slug;
  if (slug != null) return [slug];
  return [];
}

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
  const slug = getSlug(req);
  const id = slug.length >= 1 ? slug[0] : null;
  const sub = slug.length >= 2 ? slug[1] : null;

  try {
    if (id && sub === 'ledger') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const { data: supplier, error: supErr } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (supErr || !supplier) return res.status(404).json({ error: 'Supplier not found' });
      const { data: bills, error: billsErr } = await supabase
        .from('purchase_bills')
        .select('id, bill_number, bill_date, status, total, amount_paid')
        .eq('supplier_id', id)
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
    }

    if (id) {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).eq('tenant_id', tenantId).single();
        if (error || !data) return res.status(404).json({ error: 'Supplier not found' });
        return res.json(data);
      }
      if (req.method === 'PATCH') {
        const body = parseBody(req);
        const updates = {};
        if (body.name !== undefined) {
          const name = (body.name ?? '').toString().trim();
          if (!name) return res.status(400).json({ error: 'name is required' });
          if (name.length > 500) return res.status(400).json({ error: 'name too long' });
          updates.name = name;
        }
        if (body.email !== undefined) updates.email = (body.email ?? '').toString().trim().slice(0, 255) || null;
        if (body.phone !== undefined) updates.phone = (body.phone ?? '').toString().trim().slice(0, 50) || null;
        if (body.address !== undefined) updates.address = (body.address ?? '').toString().trim().slice(0, 1000) || null;
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
        const { data, error } = await supabase.from('suppliers').update(updates).eq('id', id).eq('tenant_id', tenantId).select().single();
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to update supplier' });
        }
        if (!data) return res.status(404).json({ error: 'Supplier not found' });
        return res.json(data);
      }
      if (req.method === 'DELETE') {
        const { data: bills, error: billsErr } = await supabase.from('purchase_bills').select('id').eq('supplier_id', id).eq('tenant_id', tenantId).limit(1);
        if (billsErr) {
          console.error(billsErr);
          return res.status(500).json({ error: 'Failed to check supplier usage' });
        }
        if (bills && bills.length > 0) {
          return res.status(409).json({ error: 'Cannot delete: supplier has purchase bills' });
        }
        const { error: delErr } = await supabase.from('suppliers').delete().eq('id', id).eq('tenant_id', tenantId);
        if (delErr) {
          console.error(delErr);
          return res.status(500).json({ error: 'Failed to delete supplier' });
        }
        return res.status(204).end();
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = (body.name ?? '').toString().trim();
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (name.length > 500) return res.status(400).json({ error: 'name too long' });
      const email = (body.email ?? '').toString().trim().slice(0, 255) || null;
      const phone = (body.phone ?? '').toString().trim().slice(0, 50) || null;
      const address = (body.address ?? '').toString().trim().slice(0, 1000) || null;
      const { data, error } = await supabase.from('suppliers').insert({ tenant_id: tenantId, name, email, phone, address }).select().single();
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to create supplier' });
      }
      return res.status(201).json(data);
    }

    if (req.method === 'GET') {
      let q = supabase.from('suppliers').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('name');
      const search = (req.query?.q ?? '').toString().trim();
      if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 100);
      const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
      q = q.range(offset, offset + limit - 1);
      const { data, error, count } = await q;
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to list suppliers' });
      }
      return res.json({ data: data || [], total: count ?? data?.length ?? 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Suppliers handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
