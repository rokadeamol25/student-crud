import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';

const PERIODS = [
  { id: 'this_month', label: 'This month', getRange: () => {
    const d = new Date();
    return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) };
  }},
  { id: 'last_month', label: 'Last month', getRange: () => {
    const d = new Date();
    return { from: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10), to: new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10) };
  }},
  { id: 'last_7', label: 'Last 7 days', getRange: () => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }},
  { id: 'all', label: 'All time', getRange: () => ({ from: '', to: '' }) },
];

export default function Reports() {
  const { token, tenant } = useAuth();
  const [periodId, setPeriodId] = useState('this_month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sales, setSales] = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [topProducts, setTopProducts] = useState(null);
  const [topCustomers, setTopCustomers] = useState(null);
  const [taxSummary, setTaxSummary] = useState(null);
  const [revenueTrend, setRevenueTrend] = useState(null);
  const [productProfit, setProductProfit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = PERIODS.find((p) => p.id === periodId)?.getRange() ?? { from: '', to: '' };
  const queryFrom = from || range.from;
  const queryTo = to || range.to;
  const hasRange = queryFrom && queryTo;

  const fetchAll = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    const fromToQuery = hasRange ? `?from=${encodeURIComponent(queryFrom)}&to=${encodeURIComponent(queryTo)}` : '';
    Promise.all([
      hasRange ? api.get(token, `/api/reports/sales-summary?from=${queryFrom}&to=${queryTo}`) : Promise.resolve(null),
      api.get(token, '/api/reports/invoice-summary'),
      api.get(token, '/api/reports/outstanding'),
      api.get(token, `/api/reports/top-products${fromToQuery}`),
      api.get(token, `/api/reports/top-customers${fromToQuery}`),
      hasRange ? api.get(token, `/api/reports/tax-summary?from=${queryFrom}&to=${queryTo}`) : Promise.resolve(null),
      api.get(token, '/api/reports/revenue-trend?months=6'),
      hasRange ? api.get(token, `/api/reports/product-profit?from=${queryFrom}&to=${queryTo}`) : Promise.resolve(null),
    ])
      .then(([s, i, o, p, c, t, r, pp]) => {
        setSales(s);
        setInvoiceSummary(i);
        setOutstanding(o);
        setTopProducts(p);
        setTopCustomers(c);
        setTaxSummary(t);
        setRevenueTrend(r);
        setProductProfit(pp);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, hasRange, queryFrom, queryTo]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading && !invoiceSummary) {
    return (
      <div className="page">
        <p className="page__muted">Loading reports…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Reports</h1>
      <p className="page__subtitle">Sales, products, customers, tax, and revenue trend.</p>
      <p style={{ marginBottom: '1rem' }}>
        <Link to="/reports/pnl" className="btn btn--secondary btn--sm">P&L Summary</Link>
      </p>

      <div className="page__toolbar reports-toolbar">
        <label className="form__label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Period:</span>
          <select
            className="form__input"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            style={{ width: 'auto' }}
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="form__label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>From</span>
          <input type="date" className="form__input" value={from || range.from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <label className="form__label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>To</span>
          <input type="date" className="form__input" value={to || range.to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <button type="button" className="btn btn--secondary" onClick={fetchAll}>Refresh</button>
      </div>

      {error && <div className="page__error">{error}</div>}

      {/* Sales summary */}
      <section className="card page__section">
        <h2 className="card__heading">Sales summary</h2>
        {sales ? (
          <p className="report-summary">
            Revenue (paid): <strong>{formatMoney(sales.totalRevenue, tenant)}</strong> from {sales.invoiceCount} invoices
            {hasRange && ` (${queryFrom} to ${queryTo})`}.
          </p>
        ) : (
          <p className="page__muted">Select a date range for period reports.</p>
        )}
      </section>

      {/* Invoice status summary */}
      <section className="card page__section">
        <h2 className="card__heading">Invoice status</h2>
        <div className="report-cards report-cards--inline">
          <div className="report-card">
            <span className="report-card__label">Draft</span>
            <span className="report-card__value">{invoiceSummary ? formatMoney(invoiceSummary.draft.total, tenant) : '—'}</span>
            <span className="report-card__meta">{invoiceSummary?.draft?.count ?? 0} invoices</span>
          </div>
          <div className="report-card">
            <span className="report-card__label">Sent</span>
            <span className="report-card__value">{invoiceSummary ? formatMoney(invoiceSummary.sent.total, tenant) : '—'}</span>
            <span className="report-card__meta">{invoiceSummary?.sent?.count ?? 0} invoices</span>
          </div>
          <div className="report-card">
            <span className="report-card__label">Paid</span>
            <span className="report-card__value">{invoiceSummary ? formatMoney(invoiceSummary.paid.total, tenant) : '—'}</span>
            <span className="report-card__meta">{invoiceSummary?.paid?.count ?? 0} invoices</span>
          </div>
        </div>
      </section>

      {/* Outstanding */}
      <section className="card page__section">
        <h2 className="card__heading">Outstanding (sent, not paid)</h2>
        <p className="report-summary">
          Total due: <strong>{outstanding ? formatMoney(outstanding.totalDue, tenant) : '—'}</strong>
        </p>
        {outstanding && outstanding.invoices.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {outstanding.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.invoice_number}</td>
                    <td>{inv.invoice_date}</td>
                    <td>{inv.customer_name}</td>
                    <td>{formatMoney(inv.total, tenant)}</td>
                    <td><Link to={`/invoices/${inv.id}/print`} className="btn btn--ghost btn--sm">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="page__muted">No outstanding invoices.</p>
        )}
      </section>

      {/* Top products */}
      <section className="card page__section">
        <h2 className="card__heading">Top products by revenue</h2>
        {topProducts && topProducts.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.data.map((row, idx) => (
                  <tr key={row.productId || idx}>
                    <td>{row.productName}</td>
                    <td>{row.quantity}</td>
                    <td>{formatMoney(row.revenue, tenant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="page__muted">No product sales in this period.</p>
        )}
      </section>

      {/* Product profit (COGS) */}
      <section className="card page__section">
        <h2 className="card__heading">Product profit</h2>
        {productProfit && productProfit.data && productProfit.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty sold</th>
                  <th>Sales</th>
                  <th>Cost</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {productProfit.data.map((row, idx) => (
                  <tr key={row.product_id || idx}>
                    <td>{row.product_name}</td>
                    <td>{row.quantity_sold}</td>
                    <td>{formatMoney(row.sales, tenant)}</td>
                    <td>{formatMoney(row.cost, tenant)}</td>
                    <td>{formatMoney(row.profit, tenant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="page__muted">{hasRange ? 'No product profit data in this period.' : 'Select a date range for product profit.'}</p>
        )}
      </section>

      {/* Top customers */}
      <section className="card page__section">
        <h2 className="card__heading">Top customers by revenue</h2>
        {topCustomers && topCustomers.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Invoices</th>
                  <th>Total paid</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.data.map((row) => (
                  <tr key={row.customerId}>
                    <td>{row.customerName}</td>
                    <td>{row.invoiceCount}</td>
                    <td>{formatMoney(row.totalPaid, tenant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="page__muted">No customer sales in this period.</p>
        )}
      </section>

      {/* Tax summary (CGST / SGST / IGST) */}
      <section className="card page__section">
        <h2 className="card__heading">GST / Tax summary</h2>
        {taxSummary ? (
          <>
            <p className="report-summary">
              Invoices (sent/paid): <strong>{taxSummary.invoiceCount}</strong>
              {taxSummary.period && (
                <span className="page__muted"> — {taxSummary.period.from} to {taxSummary.period.to}</span>
              )}
            </p>
            {taxSummary.byMonth && taxSummary.byMonth.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>CGST</th>
                      <th>SGST</th>
                      <th>IGST</th>
                      <th>Total tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxSummary.byMonth.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{formatMoney(row.cgst, tenant)}</td>
                        <td>{formatMoney(row.sgst, tenant)}</td>
                        <td>{formatMoney(row.igst, tenant)}</td>
                        <td>{formatMoney(row.totalTax, tenant)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {taxSummary.totals && (
                    <tfoot>
                      <tr>
                        <th>Total</th>
                        <th>{formatMoney(taxSummary.totals.cgst, tenant)}</th>
                        <th>{formatMoney(taxSummary.totals.sgst, tenant)}</th>
                        <th>{formatMoney(taxSummary.totals.igst, tenant)}</th>
                        <th>{formatMoney(taxSummary.totals.totalTax, tenant)}</th>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <p className="page__muted">No tax data in this period (or run migration 00006 for CGST/SGST/IGST).</p>
            )}
          </>
        ) : (
          <p className="page__muted">Select a date range for tax summary.</p>
        )}
      </section>

      {/* Revenue trend */}
      <section className="card page__section">
        <h2 className="card__heading">Revenue trend (last 6 months)</h2>
        {revenueTrend && revenueTrend.data.length > 0 ? (
          <>
            <div className="revenue-trend">
              {revenueTrend.data.map((row) => (
                <div key={row.month} className="revenue-trend__row">
                  <span className="revenue-trend__month">{row.month}</span>
                  <div className="revenue-trend__bar-wrap">
                    <div
                      className="revenue-trend__bar"
                      style={{
                        width: `${Math.max(0, (row.revenue / Math.max(1, ...revenueTrend.data.map((d) => d.revenue))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="revenue-trend__value">{formatMoney(row.revenue, tenant)}</span>
                </div>
              ))}
            </div>
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table className="table">
                <thead>
                  <tr><th>Month</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {revenueTrend.data.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{formatMoney(row.revenue, tenant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="page__muted">No paid invoices in the last 6 months.</p>
        )}
      </section>
    </div>
  );
}
