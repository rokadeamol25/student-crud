import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { RAM_STORAGE_OPTIONS, columnLabel, PRODUCT_COLS_BY_TRACKING_TYPE } from '../config/businessTypes';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ListSkeleton from '../components/ListSkeleton';

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
    return <input type="number" step="0.01" min="0" max="100" className={className} placeholder={placeholder || columnLabel(col)} value={value} onChange={onChange} />;
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

  const picklistCols = useMemo(() => ({
    ...PICKLIST_COLS,
    ...(config.companyOptions?.length ? { company: config.companyOptions } : {}),
    ...(config.colorOptions?.length ? { color: config.colorOptions } : {}),
  }), [config.companyOptions, config.colorOptions]);

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
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    return api.get(token, `/api/products?${params.toString()}`)
      .then((res) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        const tot = typeof res?.total === 'number' ? res.total : data.length;
        setList(data);
        setTotal(tot);
      })
      .catch((e) => setError(e.message));
  }, [token, search, trackingFilter, page]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchList().finally(() => setLoading(false));
  }, [token, search, trackingFilter, page, fetchList]);

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
        const v = (addFields[col] ?? '').toString().trim();
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
      {error && <div className="page__error">{error}</div>}
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
            className="form__input"
            placeholder="Selling price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            min="0"
            className="form__input"
            placeholder="Purchase price (optional)"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
          {extraCols.map((col) => (
            <FieldInput
              key={col}
              col={col}
              value={addFields[col] ?? ''}
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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Selling price</th>
                  <th>Purchase price</th>
                  <th>Tracking</th>
                  <th>Stock</th>
                  {extraCols.map((col) => <th key={col}>{columnLabel(col)}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{formatMoney(p.price, tenant)}</td>
                    <td>{p.purchase_price != null ? formatMoney(p.purchase_price, tenant) : '—'}</td>
                    <td><TrackingBadge type={p.tracking_type || 'quantity'} /></td>
                    <td>
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
                    {extraCols.map((col) => <td key={col}>{formatCellValue(p, col)}</td>)}
                    <td>
                      <span className="table-actions">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(p)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => openDelete(p)}>
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="pagination" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="page__muted">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!productToDelete}
        title="Delete product"
        message={productToDelete ? `Delete "${productToDelete.name}"? This cannot be undone.` : ''}
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
                <input type="number" step="0.01" min="0" className="form__input" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} required />
              </label>
              <label className="form__label">
                <span>Purchase price (optional)</span>
                <input type="number" step="0.01" min="0" className="form__input" placeholder="Default when purchasing" value={editPurchasePrice} onChange={(e) => setEditPurchasePrice(e.target.value)} />
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
                      <th>Serial Number</th>
                      <th>Status</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewData.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'monospace' }}>{s.serial_number}</td>
                        <td><span className={`badge badge--${s.status === 'available' ? 'sent' : 'draft'}`}>{s.status}</span></td>
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
                      <th>Batch #</th>
                      <th>Expiry</th>
                      <th>Qty</th>
                      <th>Cost</th>
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
