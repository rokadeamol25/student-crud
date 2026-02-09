import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { RAM_STORAGE_OPTIONS, columnLabel } from '../config/businessTypes';
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

function FieldInput({ col, value, onChange, placeholder, className = 'form__input' }) {
  if (PICKLIST_COLS[col]) {
    return (
      <select className={className} value={value} onChange={onChange}>
        <option value="">{placeholder || columnLabel(col)}</option>
        {PICKLIST_COLS[col].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  if (NUMBER_COLS.has(col)) {
    return <input type="number" step="0.01" min="0" max="100" className={className} placeholder={placeholder || columnLabel(col)} value={value} onChange={onChange} />;
  }
  return <input className={className} placeholder={placeholder || columnLabel(col)} value={value} onChange={onChange} maxLength={200} />;
}

export default function Products() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const config = useBusinessConfig();
  const productForm = config.productForm; // dynamic: { col_name: true/false, ... }

  // Determine which extra columns are enabled (truthy keys in productForm)
  const extraCols = useMemo(() =>
    Object.keys(productForm).filter((k) => productForm[k]),
    [productForm]
  );

  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  // Dynamic field values for add form: { col_name: value }
  const [addFields, setAddFields] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  // Dynamic field values for edit form
  const [editFields, setEditFields] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const addFormRef = useRef(null);

  const fetchList = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (search) params.set('q', search);
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
  }, [token, search, page]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchList().finally(() => setLoading(false));
  }, [token, search, page, fetchList]);

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
      const payload = { name: name.trim(), price: parseFloat(price, 10) || 0 };
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
      setName(''); setPrice(''); setAddFields({});
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
    setEditPrice(String(p.price));
    const ef = {};
    for (const col of extraCols) {
      ef[col] = p[col] != null ? String(p[col]) : '';
    }
    setEditFields(ef);
  }

  function closeEdit() {
    setEditing(null);
    setEditName(''); setEditPrice(''); setEditFields({});
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editing) return;
    setEditSubmitting(true);
    try {
      const payload = { name: editName.trim(), price: parseFloat(editPrice, 10) ?? 0 };
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

  function formatCellValue(p, col) {
    const v = p[col];
    if (v == null || v === '') return '—';
    if (col === 'tax_percent') return `${v}%`;
    return String(v);
  }

  return (
    <div className="page">
      <h1 className="page__title">Products</h1>
      <div className="page__toolbar">
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
        <h2 className="card__heading">Add product</h2>
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
            placeholder="Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          {extraCols.map((col) => (
            <FieldInput
              key={col}
              col={col}
              value={addFields[col] ?? ''}
              onChange={(e) => setAddField(col, e.target.value)}
            />
          ))}
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            Add
          </button>
        </form>
      </section>
      <section className="card page__section">
        <h2 className="card__heading">All products</h2>
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
                  <th>Price</th>
                  {extraCols.map((col) => <th key={col}>{columnLabel(col)}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{formatMoney(p.price, tenant)}</td>
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

      {editing && (
        <div className="modal-backdrop" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Edit product</h2>
            <form onSubmit={handleEditSubmit}>
              <label className="form__label">
                <span>Name</span>
                <input
                  className="form__input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </label>
              <label className="form__label">
                <span>Price</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form__input"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  required
                />
              </label>
              {extraCols.map((col) => (
                <label key={col} className="form__label">
                  <span>{columnLabel(col)}</span>
                  <FieldInput
                    col={col}
                    value={editFields[col] ?? ''}
                    onChange={(e) => setEditField(col, e.target.value)}
                  />
                </label>
              ))}
              <div className="modal__actions">
                <button type="button" className="btn btn--secondary" onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={editSubmitting}>
                  {editSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
