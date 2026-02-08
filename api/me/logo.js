/**
 * POST /api/me/logo — upload logo (body: { logo: "data:image/...;base64,..." } or { remove: true })
 * Returns updated tenant with logo_url.
 */
import { supabase } from '../_lib/supabase.js';
import { requireAuth } from '../_lib/auth.js';

const BUCKET = 'tenant-assets';
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req);
  if (!auth) return res.status(403).json({ error: 'User not onboarded. Complete signup first.' });

  const body = parseBody(req);
  const tenantId = auth.tenantId;

  if (body.remove === true) {
    const { data: tenant } = await supabase.from('tenants').select('logo_url').eq('id', tenantId).single();
    if (tenant?.logo_url) {
      try {
        const path = tenant.logo_url.split('/').slice(-2).join('/');
        if (path) await supabase.storage.from(BUCKET).remove([path]);
      } catch (_) { /* ignore */ }
    }
    const { data: updated, error } = await supabase.from('tenants').update({ logo_url: null }).eq('id', tenantId).select('id, name, slug, currency, currency_symbol, gstin, tax_percent, invoice_prefix, invoice_next_number, invoice_header_note, invoice_footer_note, logo_url, invoice_page_size').single();
    if (error) return res.status(500).json({ error: 'Failed to remove logo' });
    return res.json({ tenant: updated });
  }

  const dataUrl = body.logo;
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Body must include logo (data URL) or remove: true' });
  }
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Invalid logo data URL' });
  const mime = match[1].toLowerCase();
  const base64 = match[2];
  if (!ALLOWED_TYPES.includes(mime)) return res.status(400).json({ error: 'Logo must be PNG, JPEG, GIF, or WebP' });
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > MAX_SIZE_BYTES) return res.status(400).json({ error: 'Logo must be 2MB or smaller' });
  const ext = EXT[mime] || 'png';
  const path = `${tenantId}/logo.${ext}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: true,
  });
  if (uploadErr) {
    console.error(uploadErr);
    return res.status(500).json({ error: 'Failed to upload logo. Ensure bucket "' + BUCKET + '" exists and is public.' });
  }
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const logoUrl = urlData?.publicUrl || `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  const { data: updated, error: updateErr } = await supabase.from('tenants').update({ logo_url: logoUrl }).eq('id', tenantId).select('id, name, slug, currency, currency_symbol, gstin, tax_percent, invoice_prefix, invoice_next_number, invoice_header_note, invoice_footer_note, logo_url, invoice_page_size').single();
  if (updateErr) return res.status(500).json({ error: 'Failed to save logo URL' });
  return res.json({ tenant: updated });
}
