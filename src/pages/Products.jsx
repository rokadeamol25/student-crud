import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { RAM_STORAGE_OPTIONS, columnLabel, PRODUCT_COLS_BY_TRACKING_TYPE, PRODUCT_LIST_CORE_COLUMNS } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ListSkeleton from '../components/ListSkeleton';
import Pagination from '../components/Pagination';
import ActionsDropdown from '../components/ActionsDropdown';
import ErrorWithRetry from '../components/ErrorWithRetry';
import { IconSortAsc, IconSortDesc, IconSortNone } from '../components/Icons';

const PAGE_SIZE = 20;

// Columns that use a picklist (select) instead of free text
const PICKLIST_COLS = { ram_storage: RAM_STORAGE_OPTIONS };
// Columns that need type="number"
const NUMBER_COLS = new Set(['tax_percent']);

function FieldInput({ col, value, onChange, placeholder, className = 'form__input', picklistCols }) {
  const options = (picklistCols || PICKLIST_COLS)[col];
  if (options && options.length) {
    return (
      <select className={className} value={value} onChange={onChange}>
        <option value="">{placeholder || columnLabel(col)}</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  if (NUMBER_COLS.has(col)) {
    return <input type="number" step="0.01" min="0" max="100" className={`${className} form__input--number`} placeholder={placeholder || columnLabel(col)} value={value} onChange={onChange} />;
  }
  return <input className={className} placeholder={placeholder || columnLabel(col)} value={value} onChange={onChange} maxLength={200} />;
}

const TRACKING_LABELS = {
  quantity: 'Quantity',
  serial: 'Serial / IMEI',
  batch: 'Batch / Expiry',
};

function TrackingBadge({ type }) {
  const colors = { quantity: 'badge--draft', serial: 'badge--sent', batch: 'badge--paid' };
  return <span className={`badge ${colors[type] || ''}`} style={{ fontSize: '0.7rem' }}>{type}</span>;
}

export default function Products() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const config = useBusinessConfig();
  const productForm = config.productForm;
  const defaultTrackingType = tenant?.feature_config?.defaultTrackingType || 'quantity';

  // Fields shown on form/table depend on default tracking type from Settings
  const extraCols = useMemo(() => {
    const enabled = Object.keys(productForm).filter((k) => productForm[k]);
    const allowed = PRODUCT_COLS_BY_TRACKING_TYPE[defaultTrackingType];
    if (!allowed) return enabled; // quantity: show all enabled
    return enabled.filter((k) => allowed.includes(k));
  }, [productForm, defaultTrackingType]);

  // Columns to show in the product list (from Settings → productListColumns)
  const productListColumns = tenant?.feature_config?.productListColumns;
  const listColumns = useMemo(() => {
    const coreIds = PRODUCT_LIST_CORE_COLUMNS.map((c) => c.id);
    if (productListColumns && typeof productListColumns === 'object' && Object.keys(productListColumns).length > 0) {
      const core = coreIds.filter((id) => productListColumns[id]);
      const extra = extraCols.filter((col) => productListColumns[col]);
      return [...core, ...extra];
    }
    return [...coreIds, ...extraCols];
  }, [productListColumns, extraCols]);

  const picklistCols = useMemo(() => ({
    ...PICKLIST_COLS,
    ...(config.companyOptions?.length ? { company: config.companyOptions } : {}),
    ...(config.colorOptions?.length ? { color: config.colorOptions } : {}),
    ...(config.productTypeOptions?.length ? { product_type: config.productTypeOptions } : {}),
  }), [config.companyOptions, config.colorOptions, config.productTypeOptions]);

  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [addFields, setAddFields] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [trackingFilter, setTrackingFilter] = useState(''); // '' = all, 'quantity' | 'serial' | 'batch'
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editPurchasePrice, setEditPurchasePrice] = useState('');
  const [editFields, setEditFields] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Serial/Batch viewer
  const [viewProduct, setViewProduct] = useState(null); // product to view serials/batches
  const [viewData, setViewData] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const addFormRef = useRef(null);

  const fetchList = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (trackingFilter) params.set('tracking_type', trackingFilter);
    params.set('sort', sortBy);
    params.set('order', sortOrder);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    return api.get(token, `/api/products?${params.toString()}`)
      .then((res) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        const tot = typeof res?.total === 'number' ? res.total : data.length;
        setList(data);
        setTotal(tot);
      })
      .catch((e) => setError(e.message || "We couldn't load products. Check your connection and try again."));
  }, [token, search, trackingFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchList().finally(() => setLoading(false));
  }, [token, search, trackingFilter, sortBy, sortOrder, page, fetchList]);

  const PRODUCT_SORT_COLUMNS = new Set(['name', 'price', 'tracking_type']);
  function handleSort(col) {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder(col === 'price' ? 'asc' : 'asc');
    }
    setPage(0);
  }
  function SortableTh({ colKey, label }) {
    const active = sortBy === colKey;
    return (
      <th scope="col">
        <button
          type="button"
          className="table-sort-btn"
          onClick={() => handleSort(colKey)}
          aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          {label}
          <span className="table-sort-icon">
            {!active && <IconSortNone />}
            {active && sortOrder === 'asc' && <IconSortAsc />}
            {active && sortOrder === 'desc' && <IconSortDesc />}
          </span>
        </button>
      </th>
    );
  }

  function setAddField(col, val) {
    setAddFields((prev) => ({ ...prev, [col]: val }));
  }
  function setEditField(col, val) {
    setEditFields((prev) => ({ ...prev, [col]: val }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), price: parseFloat(price, 10) || 0, tracking_type: defaultTrackingType };
      const pp = (purchasePrice ?? '').toString().trim();
      if (pp !== '') {
        const ppNum = parseFloat(pp, 10);
        if (!Number.isNaN(ppNum) && ppNum >= 0) payload.purchase_price = ppNum;
      }
      for (const col of extraCols) {
        const raw = col === 'unit' ? (addFields[col] ?? config.defaultUnit ?? '') : (addFields[col] ?? '');
        const v = raw.toString().trim();
        if (col === 'tax_percent') {
          const n = parseFloat(v);
          if (v && !Number.isNaN(n)) payload[col] = n;
        } else {
          if (v) payload[col] = v;
        }
      }
      const data = await api.post(token, '/api/products', payload);
      setName(''); setPrice(''); setPurchasePrice(''); setAddFields({});
      setList((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      showToast('Product added', 'success');
    } catch (e) {
      setError(e.message || 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(p) {
    setEditing(p);
    setEditName(p.name);
    setEditPrice(String(p.price ?? ''));
    setEditPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : '');
    const ef = {};
    for (const col of extraCols) {
      ef[col] = p[col] != null ? String(p[col]) : '';
    }
    setEditFields(ef);
  }

  function closeEdit() {
    setEditing(null);
    setEditName(''); setEditPrice(''); setEditPurchasePrice(''); setEditFields({});
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editing) return;
    setEditSubmitting(true);
    try {
      const payload = { name: editName.trim(), price: parseFloat(editPrice, 10) ?? 0 };
      const pp = (editPurchasePrice ?? '').toString().trim();
      payload.purchase_price = pp === '' ? null : (parseFloat(pp, 10));
      if (payload.purchase_price !== null && (Number.isNaN(payload.purchase_price) || payload.purchase_price < 0)) {
        payload.purchase_price = null;
      }
      for (const col of extraCols) {
        const v = (editFields[col] ?? '').toString().trim();
        if (col === 'tax_percent') {
          const n = parseFloat(v);
          payload[col] = (v && !Number.isNaN(n)) ? n : undefined;
        } else {
          payload[col] = v || undefined;
        }
      }
      const data = await api.patch(token, `/api/products/${editing.id}`, payload);
      setList((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      closeEdit();
      showToast('Product updated', 'success');
    } catch (e) {
      setError(e.message || 'Failed to update');
    } finally {
      setEditSubmitting(false);
    }
  }

  function openDelete(p) {
    setProductToDelete(p);
  }

  async function handleConfirmDelete() {
    if (!productToDelete) return;
    setDeleting(true);
    setError('');
    try {
      await api.del(token, `/api/products/${productToDelete.id}`);
      setList((prev) => prev.filter((x) => x.id !== productToDelete.id));
      setTotal((t) => Math.max(0, t - 1));
      setProductToDelete(null);
      showToast('Product deleted', 'success');
    } catch (e) {
      if (e.status === 409) {
        showToast(e.message || 'Cannot delete: product is used in invoices', 'error');
      } else {
        setError(e.message || 'Failed to delete');
      }
    } finally {
      setDeleting(false);
    }
  }

  async function openView(p) {
    setViewProduct(p);
    setViewLoading(true);
    setViewData([]);
    try {
      if (p.tracking_type === 'serial') {
        const data = await api.get(token, `/api/products/${p.id}/serials`);
        setViewData(data || []);
      } else if (p.tracking_type === 'batch') {
        const data = await api.get(token, `/api/products/${p.id}/batches`);
        setViewData(data || []);
      }
    } catch {
      setViewData([]);
    } finally {
      setViewLoading(false);
    }
  }

  function formatCellValue(p, col) {
    const v = p[col];
    if (v == null || v === '') return '—';
    if (col === 'tax_percent') return `${v}%`;
    return String(v);
  }

  function stockDisplay(p) {
    const stock = Number(p.stock) || 0;
    const unit = (p.unit || 'pcs').toString().trim();
    if (!unit) return String(stock);
    return `${stock} · ${unit}`;
  }

  const currentTypeLabel = TRACKING_LABELS[defaultTrackingType] || 'Quantity';

  return (
    <div className="page">
      <h1 className="page__title">Products</h1>
      <p className="page__subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="page__muted">Default product type:</span>
        <TrackingBadge type={defaultTrackingType} />
        <span className="page__muted" style={{ fontSize: '0.875rem' }}>— new products use this. Change in Settings.</span>
      </p>
      <div className="page__toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <select
          className="form__input page__filter"
          value={trackingFilter}
          onChange={(e) => { setTrackingFilter(e.target.value); setPage(0); }}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="quantity">Quantity</option>
          <option value="serial">Serial / IMEI</option>
          <option value="batch">Batch / Expiry</option>
        </select>
        <input
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="form__input page__search"
        />
      </div>
      {error && <ErrorWithRetry message={error} onRetry={() => { setError(''); setLoading(true); fetchList().finally(() => setLoading(false)); }} />}
      <section className="card page__section" ref={addFormRef}>
        <h2 className="card__heading" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          Add product
          <span className="badge badge--draft" style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>({currentTypeLabel})</span>
        </h2>
        <form onSubmit={handleAdd} className="form form--grid" style={{ gap: '0.5rem', alignItems: 'end' }}>
          <input
            className="form__input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            min="0"
            className="form__input form__input--number"
            placeholder="Selling price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            min="0"
            className="form__input form__input--number"
            placeholder="Purchase price (optional)"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
          {extraCols.map((col) => (
            <FieldInput
              key={col}
              col={col}
              value={addFields[col] ?? (col === 'unit' ? (config.defaultUnit ?? '') : '')}
              onChange={(e) => setAddField(col, e.target.value)}
              picklistCols={picklistCols}
            />
          ))}
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            Add
          </button>
        </form>
        {defaultTrackingType === 'serial' && (
          <p className="page__muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
            Product type is Serial (from Settings). Serial numbers are entered when recording purchases.
          </p>
        )}
        {defaultTrackingType === 'batch' && (
          <p className="page__muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
            Product type is Batch (from Settings). Batch and expiry are entered when recording purchases.
          </p>
        )}
      </section>
      <section className="card page__section">
        <h2 className="card__heading">
          All products
          {trackingFilter ? <span className="page__muted" style={{ fontWeight: 'normal', fontSize: '0.875rem' }}> — {TRACKING_LABELS[trackingFilter] || trackingFilter}</span> : null}
        </h2>
        {loading ? (
          <ListSkeleton rows={6} columns={4} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add your first product to use in invoices."
            actionLabel="Add product"
            onAction={() => addFormRef.current?.scrollIntoView?.({ behavior: 'smooth' })}
          />
        ) : (
          <>
          <p className="table-swipe-hint" aria-live="polite">Swipe to see more columns</p>
          <div className="table-wrap products-list-table-wrap table-wrap--sticky">
            <table className="table">
              <thead>
                <tr>
                  {listColumns.map((col) => {
                    const label = PRODUCT_LIST_CORE_COLUMNS.find((c) => c.id === col)?.label ?? columnLabel(col);
                    if (PRODUCT_SORT_COLUMNS.has(col)) {
                      return <SortableTh key={col} colKey={col} label={label} />;
                    }
                    return <th scope="col" key={col}>{label}</th>;
                  })}
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    {listColumns.map((col) => {
                      if (col === 'name') return <td key={col}>{p.name}</td>;
                      if (col === 'price') return <td key={col}>{formatMoney(p.price, tenant)}</td>;
                      if (col === 'purchase_price') return <td key={col}>{p.purchase_price != null ? formatMoney(p.purchase_price, tenant) : '—'}</td>;
                      if (col === 'tracking') return <td key={col}><TrackingBadge type={p.tracking_type || 'quantity'} /></td>;
                      if (col === 'stock') {
                        return (
                          <td key={col}>
                            {stockDisplay(p)}
                            {(p.tracking_type === 'serial' || p.tracking_type === 'batch') && Number(p.stock) > 0 && (
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                style={{ marginLeft: '0.25rem', fontSize: '0.75rem', padding: '0.125rem 0.375rem' }}
                                onClick={() => openView(p)}
                              >
                                View
                              </button>
                            )}
                          </td>
                        );
                      }
                      return <td key={col}>{formatCellValue(p, col)}</td>;
                    })}
                    <td>
                      <ActionsDropdown
                        items={[
                          { label: 'View', icon: 'view', href: `/products/${p.id}` },
                          { label: 'Edit', icon: 'edit', onClick: () => openEdit(p) },
                          { label: 'Delete', icon: 'delete', onClick: () => openDelete(p), danger: true },
                        ]}
                        ariaLabel={`Actions for ${p.name}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <Pagination
              page={page}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              ariaLabel="Products"
            />
          )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!productToDelete}
        title="Delete product"
        message={productToDelete ? `Delete product "${productToDelete.name}"? This can't be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setProductToDelete(null)}
      />

      {/* Edit modal */}
      {editing && (
        <div className="modal-backdrop" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Edit product</h2>
            <form onSubmit={handleEditSubmit}>
              <label className="form__label">
                <span>Name</span>
                <input className="form__input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </label>
              <label className="form__label">
                <span>Selling price</span>
                <input type="number" step="0.01" min="0" className="form__input form__input--number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} required />
              </label>
              <label className="form__label">
                <span>Purchase price (optional)</span>
                <input type="number" step="0.01" min="0" className="form__input form__input--number" placeholder="Default when purchasing" value={editPurchasePrice} onChange={(e) => setEditPurchasePrice(e.target.value)} />
              </label>
              <div className="form__label">
                <span>Type</span>
                <span className="form__readonly"><TrackingBadge type={editing.tracking_type || 'quantity'} /> (set in Settings)</span>
              </div>
              {extraCols.map((col) => (
                <label key={col} className="form__label">
                  <span>{columnLabel(col)}</span>
                  <FieldInput col={col} value={editFields[col] ?? ''} onChange={(e) => setEditField(col, e.target.value)} picklistCols={picklistCols} />
                </label>
              ))}
              <div className="modal__actions">
                <button type="button" className="btn btn--secondary" onClick={closeEdit}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={editSubmitting}>
                  {editSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Serial / Batch viewer modal */}
      {viewProduct && (
        <div className="modal-backdrop" onClick={() => setViewProduct(null)}>
          <div className="modal" style={{ maxWidth: '32rem' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">
              {viewProduct.tracking_type === 'serial' ? 'Serial Numbers' : 'Batches'} — {viewProduct.name}
            </h2>
            {viewLoading ? (
              <p className="page__muted">Loading…</p>
            ) : viewData.length === 0 ? (
              <p className="page__muted">No {viewProduct.tracking_type === 'serial' ? 'serials' : 'batches'} found.</p>
            ) : viewProduct.tracking_type === 'serial' ? (
              <div className="table-wrap" style={{ maxHeight: '20rem', overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '0.8125rem' }}>
                  <thead>
                    <tr>
                      <th scope="col">Serial Number</th>
                      <th scope="col">Status</th>
                      <th scope="col">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewData.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'monospace' }}>{s.serial_number}</td>
                        <td><span className={`badge badge--${s.status === 'available' ? 'sent' : 'draft'}`} role="status" aria-label={`Serial status: ${s.status}`}>{s.status}</span></td>
                        <td>{s.cost_price != null ? formatMoney(s.cost_price, tenant) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: '20rem', overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '0.8125rem' }}>
                  <thead>
                    <tr>
                      <th scope="col">Batch #</th>
                      <th scope="col">Expiry</th>
                      <th scope="col">Qty</th>
                      <th scope="col">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewData.map((b) => (
                      <tr key={b.id}>
                        <td>{b.batch_number}</td>
                        <td>{b.expiry_date || '—'}</td>
                        <td>{Number(b.quantity)}</td>
                        <td>{b.cost_price != null ? formatMoney(b.cost_price, tenant) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal__actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn--secondary" onClick={() => setViewProduct(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
