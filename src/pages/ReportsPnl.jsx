import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ErrorWithRetry from '../components/ErrorWithRetry';

const PRESETS = [
  { id: 'this_month', label: 'This month', getRange: () => {
    const d = new Date();
    return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) };
  }},
  { id: 'last_month', label: 'Last month', getRange: () => {
    const d = new Date();
    return { from: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10), to: new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10) };
  }},
  { id: 'this_fy', label: 'This financial year (Apr–Mar)', getRange: () => {
    const d = new Date();
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
  }},
  { id: 'last_fy', label: 'Last financial year', getRange: () => {
    const d = new Date();
    const y = d.getMonth() >= 3 ? d.getFullYear() - 1 : d.getFullYear() - 2;
    return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
  }},
];

export default function ReportsPnl() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const [presetId, setPresetId] = useState('this_month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [basis, setBasis] = useState('accrual'); // 'accrual' | 'cash'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recalculating, setRecalculating] = useState(false);

  const range = PRESETS.find((p) => p.id === presetId)?.getRange() ?? { from: '', to: '' };
  const queryFrom = from || range.from;
  const queryTo = to || range.to;

  const fetchPnl = useCallback(() => {
    if (!token || !queryFrom || !queryTo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const endpoint = basis === 'cash' ? '/api/reports/pnl-cash' : '/api/reports/pnl';
    api.get(token, `${endpoint}?from=${encodeURIComponent(queryFrom)}&to=${encodeURIComponent(queryTo)}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, queryFrom, queryTo, basis]);

  useEffect(() => {
    fetchPnl();
  }, [fetchPnl]);

  async function handleRecalculate() {
    if (!token) return;
    setRecalculating(true);
    try {
      const result = await api.post(token, '/api/reports/recalculate-costs', {});
      showToast(result.message || `Updated ${result.updated} items`, 'success');
      fetchPnl();
    } catch (e) {
      showToast(e.message || 'Failed to recalculate costs', 'error');
    } finally {
      setRecalculating(false);
    }
  }

  const isCash = basis === 'cash';

  return (
    <div className="page">
      <div className="page__toolbar" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link to="/reports" className="btn btn--ghost btn--sm">← Reports</Link>
      </div>
      <h1 className="page__title">Profit &amp; Loss</h1>
      <p className="page__subtitle">
        {isCash
          ? 'Cash-basis: actual money received and paid in the period.'
          : 'Accrual-basis: revenue recognised when invoiced, cost when goods sold.'}
      </p>

      <div className="page__toolbar reports-toolbar" style={{ marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <label className="form__label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Basis:</span>
          <select
            className="form__input"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="accrual">Accrual (invoice-based)</option>
            <option value="cash">Cash (payment-based)</option>
          </select>
        </label>
        <label className="form__label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Period:</span>
          <select
            className="form__input"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            style={{ width: 'auto' }}
          >
            {PRESETS.map((p) => (
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
        <button type="button" className="btn btn--secondary" onClick={fetchPnl} disabled={loading || !queryFrom || !queryTo}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <ErrorWithRetry message={error} onRetry={fetchPnl} />}

      {!queryFrom || !queryTo ? (
        <section className="card page__section">
          <p className="page__muted">Select a date range to see P&amp;L.</p>
        </section>
      ) : loading && !data ? (
        <section className="card page__section">
          <div className="report-cards" style={{ marginBottom: '1rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="report-card">
                <span className="skeleton skeleton--text" style={{ width: '50%', height: '0.875rem' }} />
                <span className="skeleton skeleton--text" style={{ width: '70%', height: '1.25rem' }} />
              </div>
            ))}
          </div>
        </section>
      ) : data ? (
        <section className="card page__section">
          <p className="page__muted" style={{ marginBottom: '1rem' }}>{data.from} to {data.to}</p>

          {isCash ? (
            /* ---- Cash-basis view ---- */
            <div className="report-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: '1rem' }}>
              <div className="report-card">
                <span className="report-card__label">Cash received</span>
                <span className="report-card__value">{formatMoney(data.cashIn, tenant)}</span>
              </div>
              {data.revenue != null && (
                <div className="report-card">
                  <span className="report-card__label">Revenue (excl. tax)</span>
                  <span className="report-card__value">{formatMoney(data.revenue, tenant)}</span>
                </div>
              )}
              <div className="report-card">
                <span className="report-card__label">Cash paid (suppliers)</span>
                <span className="report-card__value">{formatMoney(data.cashOut, tenant)}</span>
              </div>
              <div className="report-card">
                <span className="report-card__label">Cost (COGS)</span>
                <span className="report-card__value">{formatMoney(data.totalCost, tenant)}</span>
              </div>
              <div className="report-card">
                <span className="report-card__label">Net cash flow</span>
                <span className="report-card__value" style={{ color: data.netCashFlow >= 0 ? 'var(--accent)' : 'var(--danger, #e53e3e)' }}>
                  {formatMoney(data.netCashFlow, tenant)}
                </span>
              </div>
              <div className="report-card">
                <span className="report-card__label">Gross profit</span>
                <span className="report-card__value">{formatMoney(data.grossProfit, tenant)}</span>
              </div>
              <div className="report-card">
                <span className="report-card__label">Profit %</span>
                <span className="report-card__value">{data.profitPercent.toFixed(1)}%</span>
              </div>
            </div>
          ) : (
            /* ---- Accrual-basis view ---- */
            <div className="report-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: '1rem' }}>
              <div className="report-card">
                <span className="report-card__label">Total sales (excl. tax)</span>
                <span className="report-card__value">{formatMoney(data.totalSales, tenant)}</span>
              </div>
              {data.totalSalesInclTax != null && (
                <div className="report-card">
                  <span className="report-card__label">Invoice total (incl. tax)</span>
                  <span className="report-card__value">{formatMoney(data.totalSalesInclTax, tenant)}</span>
                </div>
              )}
              <div className="report-card">
                <span className="report-card__label">Total purchases</span>
                <span className="report-card__value">{formatMoney(data.totalPurchases, tenant)}</span>
              </div>
              <div className="report-card">
                <span className="report-card__label">Cost (COGS)</span>
                <span className="report-card__value">{formatMoney(data.totalCost, tenant)}</span>
              </div>
              <div className="report-card">
                <span className="report-card__label">Gross profit</span>
                <span className="report-card__value">{formatMoney(data.grossProfit, tenant)}</span>
              </div>
              <div className="report-card">
                <span className="report-card__label">Profit %</span>
                <span className="report-card__value">{data.profitPercent.toFixed(1)}%</span>
              </div>
            </div>
          )}

          {!isCash && data.totalCost === 0 && data.totalSales > 0 && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <p className="page__muted" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <strong>COGS is ₹0?</strong> If you recorded purchase bills after creating invoices,
                the cost wasn't captured at invoice time. Click below to recalculate from current purchase prices.
              </p>
              <button type="button" className="btn btn--secondary btn--sm" onClick={handleRecalculate} disabled={recalculating}>
                {recalculating ? 'Recalculating…' : 'Recalculate costs'}
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
