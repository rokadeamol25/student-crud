import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { columnLabel, INVOICE_COLS_BY_TRACKING_TYPE } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import { amountInWords, formatDatePrint } from '../lib/amountInWords';
import html2pdf from 'html2pdf.js';

/**
 * Print / PDF view for a purchase bill.
 * When the bill has serial-tracked items, shows Serial/IMEI column with each serial number.
 * When the bill has batch-tracked items, shows Batch column with batch number, expiry, qty.
 */
export default function PurchaseBillPrint() {
  const { id } = useParams();
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const { invoiceLineItems } = useBusinessConfig();
  const defaultTrackingType = tenant?.feature_config?.defaultTrackingType || 'quantity';
  const extraCols = (() => {
    const allowed = INVOICE_COLS_BY_TRACKING_TYPE[defaultTrackingType];
    return Object.keys(invoiceLineItems).filter((k) => {
      if (!invoiceLineItems[k]) return false;
      if (k === 'imei') return false;
      if (!allowed) return true;
      return allowed.includes(k);
    });
  })();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const printAreaRef = useRef(null);

  const fetchBill = useCallback(() => {
    if (!token || !id) return;
    return api.get(token, `/api/purchase-bills/${id}`)
      .then(setBill)
      .catch((e) => setError(e.message));
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    fetchBill().finally(() => setLoading(false));
  }, [token, id, fetchBill]);

  useEffect(() => {
    const size = tenant?.invoice_page_size === 'Letter' ? 'Letter' : 'A4';
    let styleEl = document.getElementById('purchase-bill-page-size-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'purchase-bill-page-size-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@media print { @page { size: ${size}; } }`;
    return () => {
      const s = document.getElementById('purchase-bill-page-size-style');
      if (s) s.textContent = '';
    };
  }, [tenant?.invoice_page_size]);

  // Override CSS variables to white-paper values so html2canvas captures white/black
  const WHITE_PAPER_VARS = {
    '--bg': '#fff', '--bg-elevated': '#fff', '--bg-card': '#fff',
    '--text': '#000', '--text-muted': '#444',
    '--accent': '#000', '--accent-hover': '#000',
    '--border': '#333', '--shadow': 'none', '--shadow-lg': 'none', '--overlay': 'transparent',
  };

  async function handleDownloadPdf() {
    const el = printAreaRef.current;
    if (!el || !bill) return;
    setPdfGenerating(true);
    try {
      const pageSize = tenant?.invoice_page_size === 'Letter' ? 'letter' : 'a4';

      // 1. Override CSS variables on the element
      Object.entries(WHITE_PAPER_VARS).forEach(([k, v]) => el.style.setProperty(k, v));
      el.style.background = '#fff';
      el.style.color = '#000';
      el.style.border = 'none';
      el.style.boxShadow = 'none';

      // 2. Override badges
      const badges = el.querySelectorAll('.badge');
      badges.forEach((b) => {
        b.dataset.origStyle = b.style.cssText;
        b.style.cssText = 'background:#fff !important;color:#000 !important;border:1px solid #555 !important;';
      });

      // 3. Override table header for white-paper readability
      const thead = el.querySelector('.invoice-print__table thead tr');
      if (thead) { thead.dataset.origStyle = thead.style.cssText; thead.style.cssText = 'background:#f0f0f0 !important;'; }
      const ths = el.querySelectorAll('.invoice-print__table th');
      ths.forEach((th) => { th.dataset.origStyle = th.style.cssText; th.style.cssText += 'color:#000 !important;'; });

      // 4. Expand table for capture
      const tableWrap = el.querySelector('.purchase-bill-print__table-wrap');
      const table = el.querySelector('.purchase-bill-print__table');
      if (tableWrap) { tableWrap.style.overflow = 'visible'; tableWrap.style.minWidth = '0'; }
      if (table) table.style.minWidth = '0';
      const origWidth = el.style.width;
      const origMaxWidth = el.style.maxWidth;
      el.style.width = '700px';
      el.style.maxWidth = '700px';

      // 4. Wait for repaint
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)));

      // 5. Capture
      await html2pdf()
        .set({
          margin: [8, 5, 8, 5],
          filename: `purchase-bill-${(bill.bill_number || 'bill').replace(/\s+/g, '-')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 700, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: pageSize, orientation: 'portrait' },
        })
        .from(el)
        .save();

      // 6. Restore
      Object.keys(WHITE_PAPER_VARS).forEach((k) => el.style.removeProperty(k));
      el.style.background = '';
      el.style.color = '';
      el.style.border = '';
      el.style.boxShadow = '';
      el.style.width = origWidth;
      el.style.maxWidth = origMaxWidth;
      badges.forEach((b) => { b.style.cssText = b.dataset.origStyle || ''; delete b.dataset.origStyle; });
      if (thead) { thead.style.cssText = thead.dataset.origStyle || ''; delete thead.dataset.origStyle; }
      ths.forEach((th) => { th.style.cssText = th.dataset.origStyle || ''; delete th.dataset.origStyle; });
      if (tableWrap) { tableWrap.style.overflow = ''; tableWrap.style.minWidth = ''; }
      if (table) table.style.minWidth = '';

      showToast('PDF downloaded', 'success');
    } catch (e) {
      showToast(e?.message || 'Failed to generate PDF', 'error');
    } finally {
      setPdfGenerating(false);
    }
  }

  if (loading) return <div className="page"><p className="page__muted">Loading purchase bill…</p></div>;
  if (error || !bill) {
    return (
      <div className="page">
        <p className="page__error">{error || 'Purchase bill not found'}</p>
        <Link to="/purchase-bills">Back to Purchase bills</Link>
      </div>
    );
  }

  const items = bill.items || [];
  const hasSerial = items.some((it) => it.serials && it.serials.length > 0);
  const hasBatch = items.some((it) => it.batches && it.batches.length > 0);

  return (
    <div className="invoice-print-wrap">
      <div className="invoice-print-actions no-print" style={{ marginBottom: '1rem' }}>
        <Link to={`/purchase-bills/${id}`} className="btn btn--secondary">← Back to bill</Link>
        <span style={{ marginLeft: '0.5rem' }}>
          Status: <span className={`badge badge--${bill.status === 'draft' ? 'draft' : bill.status === 'recorded' ? 'sent' : 'paid'}`}>{bill.status}</span>
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="btn btn--secondary" onClick={handleDownloadPdf} disabled={pdfGenerating}>
            {pdfGenerating ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="invoice-print purchase-bill-print" ref={printAreaRef}>
        {/* ── Header: Two-column ── */}
        <header className="invoice-print__header">
          <div className="invoice-print__header-left">
            {tenant?.logo_url && (
              <img src={tenant.logo_url} alt="" className="invoice-print__logo" />
            )}
            <div>
              <h1 className="invoice-print__shop">{tenant?.name || 'Shop'}</h1>
              {tenant?.gstin && <p className="invoice-print__meta">GSTIN: {tenant.gstin}</p>}
              {tenant?.address && <p className="invoice-print__meta">{tenant.address}</p>}
              {tenant?.phone && <p className="invoice-print__meta">{tenant.phone}</p>}
            </div>
          </div>
          <div className="invoice-print__header-right">
            <h2 className="invoice-print__title">PURCHASE BILL</h2>
            <p className="invoice-print__header-detail"><span>No:</span> <strong>{bill.bill_number}</strong></p>
            <p className="invoice-print__header-detail"><span>Date:</span> <strong>{formatDatePrint(bill.bill_date)}</strong></p>
          </div>
        </header>

        {/* ── Parties: Two-column ── */}
        <div className="invoice-print__parties">
          <div className="invoice-print__party">
            <h3>Supplier</h3>
            <p className="invoice-print__customer">{bill.supplier?.name ?? '—'}</p>
            {bill.supplier?.phone && <p>{bill.supplier.phone}</p>}
            {bill.supplier?.address && <p className="invoice-print__address">{bill.supplier.address}</p>}
          </div>
          <div className="invoice-print__party invoice-print__party--right">
            <h3>Bill Details</h3>
            <p><span className="invoice-print__detail-label">Bill No:</span> {bill.bill_number}</p>
            <p><span className="invoice-print__detail-label">Date:</span> {formatDatePrint(bill.bill_date)}</p>
            {bill.status && (
              <p><span className="invoice-print__detail-label">Status:</span> <span className={`badge badge--${bill.status === 'draft' ? 'draft' : bill.status === 'recorded' ? 'sent' : 'paid'}`}>{bill.status}</span></p>
            )}
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="purchase-bill-print__table-wrap invoice-print__table-wrap">
          <table className="purchase-bill-print__table invoice-print__table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th>Product</th>
                {hasSerial && <th>Serial / IMEI</th>}
                {hasBatch && <th>Batch</th>}
                {extraCols.map((col) => <th key={col}>{columnLabel(col)}</th>)}
                <th className="col-right">Qty</th>
                <th className="col-right">Unit Price</th>
                <th className="col-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const product = it.product || {};
                const serials = it.serials || [];
                const batches = it.batches || [];
                return (
                  <tr key={it.id || i}>
                    <td className="col-num">{i + 1}</td>
                    <td>{product.name ?? '—'}</td>
                    {hasSerial && (
                      <td>
                        {serials.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            {serials.map((s, j) => (
                              <span key={s.id || j}>{s.serial_number}</span>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {hasBatch && (
                      <td>
                        {batches.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85em' }}>
                            {batches.map((b, j) => (
                              <span key={b.id || j}>
                                {b.batch_number}
                                {b.expiry_date ? ` · Exp: ${b.expiry_date}` : ''}
                                {b.quantity != null ? ` · Qty: ${b.quantity}` : ''}
                              </span>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {extraCols.map((col) => <td key={col}>{product[col] || '—'}</td>)}
                    <td className="col-right">{Number(it.quantity)}</td>
                    <td className="col-right">{formatMoney(it.purchase_price, tenant)}</td>
                    <td className="col-right">{formatMoney(it.amount, tenant)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Totals box ── */}
        <div className="invoice-print__totals-box">
          <div className="invoice-print__total-row invoice-print__total-row--grand">
            <span>Total</span>
            <span>{formatMoney(bill.total, tenant)}</span>
          </div>
        </div>

        {/* ── Amount in words ── */}
        <div className="invoice-print__words">
          {amountInWords(Number(bill.total))}
        </div>

        {/* ── Footer / Payment info ── */}
        <div className="invoice-print__footer-section">
          {bill.status !== 'draft' && (
            <p className="invoice-print__footer">
              Amount paid: {formatMoney(bill.amount_paid ?? 0, tenant)}
              {Number(bill.balance) > 0 && <> &middot; Balance: {formatMoney(bill.balance, tenant)}</>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
