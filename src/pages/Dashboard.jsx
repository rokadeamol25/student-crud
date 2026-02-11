import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import DashboardSkeleton from '../components/DashboardSkeleton';
import ErrorWithRetry from '../components/ErrorWithRetry';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatPeriod(from, to) {
  if (!from || !to) return '';
  const f = new Date(from + 'T12:00:00');
  const t = new Date(to + 'T12:00:00');
  return `${f.getDate()} ${f.toLocaleString('default', { month: 'short' })} – ${t.getDate()} ${t.toLocaleString('default', { month: 'short' })} ${t.getFullYear()}`;
}

export default function Dashboard() {
  const { token, tenant } = useAuth();
  const [sales, setSales] = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const period = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from, to, label: formatPeriod(from, to) };
  }, []);

  const fetchData = useCallback(() => {
    if (!token) return;
    setError('');
    setLoading(true);
    Promise.all([
      api.get(token, `/api/reports/sales-summary?from=${period.from}&to=${period.to}`),
      api.get(token, '/api/reports/invoice-summary'),
      api.get(token, '/api/reports/outstanding'),
    ])
      .then(([s, i, o]) => {
        setSales(s);
        setInvoiceSummary(i);
        setOutstanding(o);
      })
      .catch((e) => setError(e.message || "We couldn't load the dashboard. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [token, period.from, period.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !sales && !invoiceSummary && !outstanding) {
    return (
      <div className="page">
        <DashboardSkeleton />
      </div>
    );
  }

  const shopName = tenant?.name?.trim();
  const greetingText = shopName ? `${greeting()}, ${shopName}` : greeting();

  return (
    <div className="dashboard">
      <h1 className="dashboard__title">{greetingText}</h1>
      <p className="dashboard__subtitle">Manage your shop billing.</p>

      {error && <ErrorWithRetry message={error} onRetry={fetchData} />}

      {/* Quick actions */}
      <section className="dashboard__quick-actions" aria-label="Quick actions">
        <Link to="/invoices/new" className="btn btn--primary dashboard__quick-action">
          New invoice
        </Link>
        <Link to="/invoices?status=sent" className="btn btn--secondary dashboard__quick-action">
          Record payment
        </Link>
        <Link to="/products" className="btn btn--secondary dashboard__quick-action">
          New product
        </Link>
      </section>

      {/* Report summary cards */}
      <section className="dashboard__reports card page__section">
        <h2 className="card__heading">This month</h2>
        {period.label && (
          <p className="dashboard__period" aria-label="Period">{period.label}</p>
        )}
        <div className="report-cards">
          <div className="report-card report-card--revenue">
            <span className="report-card__label">Revenue (paid)</span>
            <span className="report-card__value">{sales ? formatMoney(sales.totalRevenue, tenant) : '—'}</span>
            {sales && <span className="report-card__meta">{sales.invoiceCount} invoices</span>}
          </div>
          <div className="report-card">
            <span className="report-card__label">Draft</span>
            <span className="report-card__value">{invoiceSummary ? formatMoney(invoiceSummary.draft.total, tenant) : '—'}</span>
            {invoiceSummary && <span className="report-card__meta">{invoiceSummary.draft.count} invoices</span>}
          </div>
          <div className="report-card">
            <span className="report-card__label">Sent (pending)</span>
            <span className="report-card__value">{invoiceSummary ? formatMoney(invoiceSummary.sent.total, tenant) : '—'}</span>
            {invoiceSummary && <span className="report-card__meta">{invoiceSummary.sent.count} invoices</span>}
          </div>
          {(outstanding && (outstanding.totalDue > 0 || outstanding.invoices?.length > 0)) ? (
            <Link to="/invoices?status=sent" className="report-card report-card--outstanding report-card--clickable">
              <span className="report-card__label">Outstanding</span>
              <span className="report-card__value">{formatMoney(outstanding.totalDue, tenant)}</span>
              <span className="report-card__meta">{outstanding.invoices?.length || 0} unpaid</span>
              <span className="report-card__link">View invoices →</span>
            </Link>
          ) : (
            <div className="report-card report-card--outstanding">
              <span className="report-card__label">Outstanding</span>
              <span className="report-card__value">{outstanding ? formatMoney(outstanding.totalDue, tenant) : '—'}</span>
              {outstanding && <span className="report-card__meta">No unpaid invoices</span>}
            </div>
          )}
        </div>
        <p className="page__muted" style={{ marginTop: '0.75rem' }}>
          <Link to="/reports">View all reports</Link> — sales, top products, customers, tax summary, revenue trend.
        </p>
      </section>

      <section className="dashboard__links">
        <Link to="/products" className="dashboard__card">
          <span className="dashboard__cardTitle">Products</span>
          <span className="dashboard__cardDesc">Add and manage products</span>
        </Link>
        <Link to="/customers" className="dashboard__card">
          <span className="dashboard__cardTitle">Customers</span>
          <span className="dashboard__cardDesc">Manage customers</span>
        </Link>
        <Link to="/invoices" className="dashboard__card">
          <span className="dashboard__cardTitle">Invoices</span>
          <span className="dashboard__cardDesc">View and create invoices</span>
        </Link>
        <Link to="/invoices/new" className="dashboard__card dashboard__card--primary">
          <span className="dashboard__cardTitle">New invoice</span>
          <span className="dashboard__cardDesc">Create an invoice</span>
        </Link>
      </section>
    </div>
  );
}
