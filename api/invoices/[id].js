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

function validateItem(item, index) {
  const desc = (item?.description ?? '').toString().trim();
  if (!desc) return { error: `items[${index}].description is required` };
  const qty = Number(item?.quantity);
  if (qty === undefined || Number.isNaN(qty) || qty <= 0) return { error: `items[${index}].quantity must be > 0` };
  const unitPrice = Number(item?.unitPrice ?? item?.unit_price);
  if (unitPrice === undefined || Number.isNaN(unitPrice) || unitPrice < 0) return { error: `items[${index}].unitPrice must be >= 0` };
  return { description: desc, quantity: qty, unit_price: unitPrice };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Invoice id required' });
  const tenantId = auth.tenantId;

  try {
    if (req.method === 'GET') {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*, customers(id, name, email, phone, address)')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

      const [{ data: items }, { data: payments }] = await Promise.all([
        supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at'),
        supabase.from('payments').select('*').eq('invoice_id', id).eq('tenant_id', tenantId).order('paid_at').order('created_at'),
      ]);
      const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
      const amountPaid = Number(invoice.amount_paid) || 0;
      const total = Number(invoice.total) || 0;
      const balance = Math.round((total - amountPaid) * 100) / 100;
      const { customers: _c, ...inv } = invoice;
      return res.json({
        ...inv,
        amount_paid: amountPaid,
        balance,
        customer: customer || null,
        invoice_items: items || [],
        payments: payments || [],
      });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const rawItems = Array.isArray(body.items) ? body.items : null;

      if (rawItems !== null) {
        // Full draft update (customerId, invoiceDate, items)
        const { data: existing, error: fetchErr } = await supabase
          .from('invoices')
          .select('status')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .single();
        if (fetchErr || !existing) return res.status(404).json({ error: 'Invoice not found' });
        if (existing.status !== 'draft') {
          return res.status(400).json({ error: 'Only draft invoices can be edited' });
        }
        const customerId = (body.customerId ?? body.customer_id ?? '').toString().trim();
        if (!customerId) return res.status(400).json({ error: 'customerId is required' });
        const invoiceDate = (body.invoiceDate ?? body.invoice_date ?? '').toString().trim();
        if (!invoiceDate) return res.status(400).json({ error: 'invoiceDate is required' });
        if (Number.isNaN(new Date(invoiceDate).getTime())) return res.status(400).json({ error: 'invoiceDate must be a valid date' });
        if (rawItems.length === 0) return res.status(400).json({ error: 'items array is required and non-empty' });

        const { data: customer } = await supabase.from('customers').select('id').eq('id', customerId).eq('tenant_id', tenantId).single();
        if (!customer) return res.status(400).json({ error: 'Customer not found or does not belong to your shop' });

        const gstType = (body.gst_type ?? body.gstType ?? 'intra').toString().toLowerCase() === 'inter' ? 'inter' : 'intra';
        const { data: tenantRow } = await supabase.from('tenants').select('tax_percent').eq('id', tenantId).single();
        const tenantTaxPercent = tenantRow?.tax_percent != null ? Number(tenantRow.tax_percent) : 0;

        const items = [];
        for (let i = 0; i < rawItems.length; i++) {
          const v = validateItem(rawItems[i], i);
          if (v.error) return res.status(400).json({ error: v.error });
          let desc = v.description;
          let unitPrice = v.unit_price;
          let productTaxPercent = null;
          let hsnSacCode = null;
          const productId = (rawItems[i].productId ?? rawItems[i].product_id)?.toString().trim();
          let costPrice = 0;
          if (productId) {
            const { data: product } = await supabase.from('products').select('name, price, tax_percent, hsn_sac_code, last_purchase_price').eq('id', productId).eq('tenant_id', tenantId).single();
            if (product) {
              if (!desc) desc = product.name;
              if (unitPrice == null) unitPrice = Number(product.price);
              if (product.tax_percent != null) productTaxPercent = Number(product.tax_percent);
              if (product.hsn_sac_code) hsnSacCode = String(product.hsn_sac_code).trim().slice(0, 20) || null;
              costPrice = product.last_purchase_price != null ? Number(product.last_purchase_price) : 0;
            }
          }
          const taxPercentItem = productTaxPercent ?? tenantTaxPercent;
          const amount = Math.round(v.quantity * unitPrice * 100) / 100;
          const costAmount = Math.round(v.quantity * costPrice * 100) / 100;
          const itemTax = Math.round(amount * taxPercentItem / 100 * 100) / 100;
          const cgst = gstType === 'intra' ? Math.round(itemTax / 2 * 100) / 100 : 0;
          const sgst = gstType === 'intra' ? Math.round((itemTax - cgst) * 100) / 100 : 0;
          const igst = gstType === 'inter' ? itemTax : 0;
          items.push({
            product_id: productId || null,
            description: desc,
            quantity: v.quantity,
            unit_price: unitPrice,
            amount,
            cost_price: costPrice,
            cost_amount: costAmount,
            tax_percent: taxPercentItem,
            gst_type: gstType,
            cgst_amount: cgst,
            sgst_amount: sgst,
            igst_amount: igst,
            hsn_sac_code: hsnSacCode,
          });
        }
        const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
        const taxAmount = Math.round(items.reduce((s, i) => s + i.cgst_amount + i.sgst_amount + i.igst_amount, 0) * 100) / 100;
        const total = Math.round((subtotal + taxAmount) * 100) / 100;
        const effectiveTaxPercent = subtotal > 0 ? Math.round(taxAmount / subtotal * 10000) / 100 : tenantTaxPercent;

        const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', id);
        if (delErr) {
          console.error(delErr);
          return res.status(500).json({ error: 'Failed to update invoice' });
        }
        const { data: invoice, error: updateErr } = await supabase
          .from('invoices')
          .update({ customer_id: customerId, invoice_date: invoiceDate, subtotal, tax_percent: effectiveTaxPercent, tax_amount: taxAmount, total, gst_type: gstType })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (updateErr) {
          console.error(updateErr);
          return res.status(500).json({ error: 'Failed to update invoice' });
        }
        const itemRow = (it, includeCost) => {
          const row = {
            invoice_id: id,
            product_id: it.product_id,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            amount: it.amount,
            tax_percent: it.tax_percent,
            gst_type: it.gst_type,
            cgst_amount: it.cgst_amount,
            sgst_amount: it.sgst_amount,
            igst_amount: it.igst_amount,
            hsn_sac_code: it.hsn_sac_code,
          };
          if (includeCost) {
            row.cost_price = it.cost_price;
            row.cost_amount = it.cost_amount;
          }
          return row;
        };
        for (const it of items) {
          let itemErr = (await supabase.from('invoice_items').insert(itemRow(it, true))).error;
          if (itemErr && (String(itemErr.message || '').includes('cost_price') || String(itemErr.message || '').includes('cost_amount') || String(itemErr.message || '').includes('does not exist'))) {
            itemErr = (await supabase.from('invoice_items').insert(itemRow(it, false))).error;
          }
          if (itemErr) {
            console.error(itemErr);
            return res.status(500).json({ error: 'Failed to update invoice items' });
          }
        }
        const { data: itemsData } = await supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at');
        return res.json({ ...invoice, invoice_items: itemsData || [] });
      }

      // Status-only update
      const status = (body.status ?? '').toString().toLowerCase();
      if (!['sent', 'paid'].includes(status)) {
        return res.status(400).json({ error: 'status must be sent or paid' });
      }
      const { data: existing, error: fetchErr } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .eq('tenant_id', tenantId)
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
        .eq('tenant_id', tenantId)
        .select()
        .single();
      if (updateErr) {
        console.error(updateErr);
        return res.status(500).json({ error: 'Failed to update invoice status' });
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      const { data: existing, error: fetchErr } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (fetchErr || !existing) return res.status(404).json({ error: 'Invoice not found' });
      if (existing.status !== 'draft') {
        return res.status(400).json({ error: 'Only draft invoices can be deleted' });
      }
      const { error: delErr } = await supabase.from('invoices').delete().eq('id', id).eq('tenant_id', tenantId);
      if (delErr) {
        console.error(delErr);
        return res.status(500).json({ error: 'Failed to delete invoice' });
      }
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Invoices [id] handler error:', err);
    return res.status(500).json({ error: err.message || 'A server error has occurred' });
  }
}
