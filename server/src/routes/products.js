/**
 * Products API: all queries filtered by req.tenantId (never from client).
 * Supports tracking_type (quantity, serial, batch), serials, and batches.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VALID_TRACKING = ['quantity', 'serial', 'batch'];

function validateCreate(body) {
  const name = (body?.name ?? '').toString().trim();
  if (!name) return { error: 'name is required' };
  if (name.length > 500) return { error: 'name too long' };
  const price = Number(body?.price);
  if (price === undefined || price === null || Number.isNaN(price) || price < 0) {
    return { error: 'price is required and must be >= 0' };
  }
  const purchasePriceRaw = body?.purchase_price;
  const purchasePrice = (purchasePriceRaw === undefined || purchasePriceRaw === null || purchasePriceRaw === '')
    ? null
    : (Number(purchasePriceRaw));
  if (purchasePrice !== null && (Number.isNaN(purchasePrice) || purchasePrice < 0)) {
    return { error: 'purchase_price must be >= 0 when provided' };
  }
  const unit = (body?.unit ?? '').toString().trim().slice(0, 50) || null;
  const sku = (body?.sku ?? '').toString().trim().slice(0, 100) || null;
  const trackingType = (body?.tracking_type ?? 'quantity').toString().toLowerCase();
  if (!VALID_TRACKING.includes(trackingType)) return { error: 'tracking_type must be quantity, serial, or batch' };
  const hsnSacCode = (body?.hsn_sac_code ?? body?.hsnSacCode ?? '').toString().trim().slice(0, 20) || null;
  const p = Number(body?.tax_percent);
  const taxPercent = (body?.tax_percent !== undefined && body?.tax_percent !== null && !Number.isNaN(p) && p >= 0 && p <= 100) ? p : null;
  const company = (body?.company ?? '').toString().trim().slice(0, 200) || null;
  const ramStorage = (body?.ram_storage ?? '').toString().trim().slice(0, 100) || null;
  const imei = (body?.imei ?? '').toString().trim().slice(0, 50) || null;
  const color = (body?.color ?? '').toString().trim().slice(0, 100) || null;
  return { name, price, purchase_price: purchasePrice, unit, sku, tracking_type: trackingType, hsn_sac_code: hsnSacCode, tax_percent: taxPercent, company, ram_storage: ramStorage, imei, color };
}

router.post('/', async (req, res, next) => {
  try {
    const validated = validateCreate(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    const row = {
      tenant_id: req.tenantId,
      name: validated.name,
      price: validated.price,
      unit: validated.unit,
      sku: validated.sku,
      tracking_type: validated.tracking_type,
      hsn_sac_code: validated.hsn_sac_code,
      tax_percent: validated.tax_percent,
      company: validated.company,
      ram_storage: validated.ram_storage,
      imei: validated.imei,
      color: validated.color,
    };
    if (validated.purchase_price !== null) row.purchase_price = validated.purchase_price;
    const { data, error } = await supabase
      .from('products')
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error(error);
      if (String(error.message || '').includes('idx_products_tenant_sku')) {
        return res.status(409).json({ error: 'A product with this SKU already exists' });
      }
      return res.status(500).json({ error: 'Failed to create product' });
    }
    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('name');
    // Filter inactive by default unless explicitly requested
    if (req.query?.include_inactive !== 'true') {
      q = q.eq('is_active', true);
    }
    const search = (req.query?.q ?? '').toString().trim();
    if (search) q = q.or(`name.ilike.%${search}%,company.ilike.%${search}%,imei.ilike.%${search}%,sku.ilike.%${search}%`);
    const trackingFilter = (req.query?.tracking_type ?? '').toString().trim();
    if (trackingFilter && VALID_TRACKING.includes(trackingFilter)) {
      q = q.eq('tracking_type', trackingFilter);
    }
    const limit = Math.min(Math.max(0, parseInt(req.query?.limit, 10) || 50), 500);
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to list products' });
    }
    return res.json({ data: data || [], total: count ?? data?.length ?? 0 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Product not found' });
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
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (Number.isNaN(price) || price < 0) return res.status(400).json({ error: 'price must be >= 0' });
      updates.price = price;
    }
    if (body.purchase_price !== undefined) {
      const v = body.purchase_price;
      updates.purchase_price = (v === '' || v === null || v === undefined) ? null : (Number(v) >= 0 ? Number(v) : null);
      if (updates.purchase_price !== null && (Number.isNaN(updates.purchase_price) || updates.purchase_price < 0)) {
        return res.status(400).json({ error: 'purchase_price must be >= 0' });
      }
    }
    if (body.unit !== undefined) {
      updates.unit = (body.unit ?? '').toString().trim().slice(0, 50) || null;
    }
    if (body.sku !== undefined) {
      updates.sku = (body.sku ?? '').toString().trim().slice(0, 100) || null;
    }
    if (body.tracking_type !== undefined) {
      const tt = (body.tracking_type ?? '').toString().toLowerCase();
      if (!VALID_TRACKING.includes(tt)) return res.status(400).json({ error: 'tracking_type must be quantity, serial, or batch' });
      // Guard: only allow change when stock = 0
      const { data: prod } = await supabase.from('products').select('stock, tracking_type').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
      if (!prod) return res.status(404).json({ error: 'Product not found' });
      if (Number(prod.stock) > 0 && tt !== prod.tracking_type) {
        return res.status(400).json({ error: 'Cannot change tracking type when stock > 0. Sell or adjust all stock first.' });
      }
      updates.tracking_type = tt;
    }
    if (body.is_active !== undefined) {
      updates.is_active = body.is_active === true || body.is_active === 'true';
    }
    if (body.hsn_sac_code !== undefined || body.hsnSacCode !== undefined) {
      updates.hsn_sac_code = (body.hsn_sac_code ?? body.hsnSacCode ?? '').toString().trim().slice(0, 20) || null;
    }
    if (body.tax_percent !== undefined) {
      const p = Number(body.tax_percent);
      updates.tax_percent = (Number.isNaN(p) || p < 0 || p > 100) ? null : p;
    }
    if (body.company !== undefined) updates.company = (body.company ?? '').toString().trim().slice(0, 200) || null;
    if (body.ram_storage !== undefined) updates.ram_storage = (body.ram_storage ?? '').toString().trim().slice(0, 100) || null;
    if (body.imei !== undefined) updates.imei = (body.imei ?? '').toString().trim().slice(0, 50) || null;
    if (body.color !== undefined) updates.color = (body.color ?? '').toString().trim().slice(0, 100) || null;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (error) {
      console.error(error);
      if (String(error.message || '').includes('idx_products_tenant_sku')) {
        return res.status(409).json({ error: 'A product with this SKU already exists' });
      }
      return res.status(500).json({ error: 'Failed to update product' });
    }
    if (!data) return res.status(404).json({ error: 'Product not found' });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: used } = await supabase.from('invoice_items').select('id').eq('product_id', id).limit(1);
    if (used && used.length > 0) {
      return res.status(409).json({ error: 'Cannot delete: product is used in invoices' });
    }
    const { error } = await supabase.from('products').delete().eq('id', id).eq('tenant_id', req.tenantId);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to delete product' });
    }
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// =============================================
// SERIALS sub-routes: GET list, POST add
// =============================================
router.get('/:id/serials', async (req, res, next) => {
  try {
    const productId = req.params.id;
    const statusFilter = (req.query?.status ?? '').toString().trim();
    let q = supabase
      .from('product_serials')
      .select('*')
      .eq('product_id', productId)
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (statusFilter) q = q.eq('status', statusFilter);
    const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 500);
    q = q.limit(limit);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch serials' });
    }
    return res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// =============================================
// BATCHES sub-routes: GET list
// =============================================
router.get('/:id/batches', async (req, res, next) => {
  try {
    const productId = req.params.id;
    let q = supabase
      .from('product_batches')
      .select('*')
      .eq('product_id', productId)
      .eq('tenant_id', req.tenantId)
      .order('expiry_date', { ascending: true, nullsFirst: false });
    if (req.query?.active === 'true') {
      q = q.gt('quantity', 0);
    }
    const { data, error } = await q;
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch batches' });
    }
    return res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// =============================================
// STOCK MOVEMENTS: GET list for a product
// =============================================
router.get('/:id/stock-movements', async (req, res, next) => {
  try {
    const productId = req.params.id;
    const limit = Math.min(parseInt(req.query?.limit, 10) || 50, 200);
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', productId)
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
    return res.json(data || []);
  } catch (err) {
    next(err);
  }
});

export default router;
