import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
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

  async function handleDownloadPdf() {
    const el = printAreaRef.current;
    if (!el || !bill) return;
    setPdfGenerating(true);
    try {
      const pageSize = tenant?.invoice_page_size === 'Letter' ? 'letter' : 'a4';
      const tableWrap = el.querySelector('.purchase-bill-print__table-wrap');
      const table = el.querySelector('.purchase-bill-print__table');
      if (tableWrap) {
        tableWrap.style.overflow = 'visible';
        tableWrap.style.minWidth = '0';
      }
      if (table) table.style.minWidth = '0';
      const origWidth = el.style.width;
      const origMaxWidth = el.style.maxWidth;
      el.style.width = '700px';
      el.style.maxWidth = '700px';

      await html2pdf()
        .set({
          margin: [8, 5, 8, 5],
          filename: `purchase-bill-${(bill.bill_number || 'bill').replace(/\s+/g, '-')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 700 },
          jsPDF: { unit: 'mm', format: pageSize, orientation: 'portrait' },
        })
        .from(el)
        .save();

      el.style.width = origWidth;
      el.style.maxWidth = origMaxWidth;
      if (tableWrap) {
        tableWrap.style.overflow = '';
        tableWrap.style.minWidth = '';
      }
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
        <header className="invoice-print__header">
          <div className="invoice-print__header-left">
            {tenant?.logo_url && (
              <img src={tenant.logo_url} alt="" className="invoice-print__logo" />
            )}
            <div>
              <h1 className="invoice-print__shop">{tenant?.name || 'Shop'}</h1>
              {tenant?.gstin && <p className="invoice-print__meta">GSTIN: {tenant.gstin}</p>}
              <p className="invoice-print__meta">Purchase bill</p>
            </div>
          </div>
          <div className="invoice-print__num">
            <strong>{bill.bill_number}</strong>
            <br />
            <span>{bill.bill_date}</span>
          </div>
        </header>

        <div className="invoice-print__parties">
          <div>
            <h3>Supplier</h3>
            <p className="invoice-print__customer">{bill.supplier?.name ?? '—'}</p>
            {bill.supplier?.phone && <p>{bill.supplier.phone}</p>}
            {bill.supplier?.address && <p className="invoice-print__address">{bill.supplier.address}</p>}
          </div>
        </div>

        <div className="purchase-bill-print__table-wrap invoice-print__table-wrap">
          <table className="purchase-bill-print__table invoice-print__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Type</th>
                {hasSerial && <th>Serial / IMEI</th>}
                {hasBatch && <th>Batch</th>}
                <th>Qty</th>
                <th>Unit price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const product = it.product || {};
                const trackingType = product.tracking_type || 'quantity';
                const serials = it.serials || [];
                const batches = it.batches || [];
                return (
                  <tr key={it.id || i}>
                    <td>{i + 1}</td>
                    <td>{product.name ?? '—'}</td>
                    <td>
                      <span className={`badge badge--${trackingType === 'serial' ? 'sent' : trackingType === 'batch' ? 'paid' : 'draft'}`} style={{ fontSize: '0.7rem' }}>
                        {trackingType}
                      </span>
                    </td>
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
                    <td>{Number(it.quantity)}</td>
                    <td>{formatMoney(it.purchase_price, tenant)}</td>
                    <td>{formatMoney(it.amount, tenant)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="invoice-print__totals">
          <div className="invoice-print__total">
            <span>Total</span>
            <span>{formatMoney(bill.total, tenant)}</span>
          </div>
        </div>

        {bill.status !== 'draft' && (
          <p className="invoice-print__footer" style={{ marginTop: '1rem' }}>
            Amount paid: {formatMoney(bill.amount_paid ?? 0, tenant)}
            {Number(bill.balance) > 0 && <> · Balance: {formatMoney(bill.balance, tenant)}</>}
          </p>
        )}
      </div>
    </div>
  );
}
