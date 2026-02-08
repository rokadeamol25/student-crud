/**
 * Suppliers API: all queries filtered by req.tenantId.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function validateCreate(body) {
  const name = (body?.name ?? '').toString().trim();
  if (!name) return { error: 'name is required' };
  if (name.length > 500) return { error: 'name too long' };
  const email = (body?.email ?? '').toString().trim().slice(0, 255) || null;
  const phone = (body?.phone ?? '').toString().trim().slice(0, 50) || null;
  const address = (body?.address ?? '').toString().trim().slice(0, 1000) || null;
  return { name, email, phone, address };
}

router.post('/', async (req, res, next) => {
  try {
    const validated = validateCreate(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        tenant_id: req.tenantId,
        name: validated.name,
        email: validated.email,
        phone: validated.phone,
        address: validated.address,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to create supplier' });
    }
    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('suppliers')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('name');
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
  } catch (err) {
    next(err);
  }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    const supplierId = req.params.id;
    const { data: supplier, error: supErr } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('id', supplierId)
      .eq('tenant_id', req.tenantId)
      .single();
    if (supErr || !supplier) return res.status(404).json({ error: 'Supplier not found' });

    const { data: bills, error: billsErr } = await supabase
      .from('purchase_bills')
      .select('id, bill_number, bill_date, status, total, amount_paid')
      .eq('supplier_id', supplierId)
      .eq('tenant_id', req.tenantId)
      .order('bill_date', { ascending: false });
    if (billsErr) throw billsErr;
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
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Supplier not found' });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
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
    const { data, error } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to update supplier' });
    }
    if (!data) return res.status(404).json({ error: 'Supplier not found' });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data: bills } = await supabase
      .from('purchase_bills')
      .select('id')
      .eq('supplier_id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .limit(1);
    if (bills && bills.length > 0) {
      return res.status(409).json({ error: 'Cannot delete: supplier has purchase bills' });
    }
    const { error } = await supabase.from('suppliers').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to delete supplier' });
    }
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;