import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ListSkeleton from '../components/ListSkeleton';

const PAGE_SIZE = 20;

export default function Products() {
  const { token, tenant } = useAuth();
  const { showToast } = useToast();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [taxPercent, setTaxPercent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editHsnSacCode, setEditHsnSacCode] = useState('');
  const [editTaxPercent, setEditTaxPercent] = useState('');
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

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await api.post(token, '/api/products', {
        name: name.trim(),
        price: parseFloat(price, 10) || 0,
        unit: unit.trim() || undefined,
        hsn_sac_code: hsnSacCode.trim() || undefined,
        tax_percent: taxPercent !== '' && !Number.isNaN(parseFloat(taxPercent, 10)) ? parseFloat(taxPercent, 10) : undefined,
      });
      setName('');
      setPrice('');
      setUnit('');
      setHsnSacCode('');
      setTaxPercent('');
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
    setEditUnit(p.unit || '');
    setEditHsnSacCode(p.hsn_sac_code || '');
    setEditTaxPercent(p.tax_percent != null ? String(p.tax_percent) : '');
  }

  function closeEdit() {
    setEditing(null);
    setEditName('');
    setEditPrice('');
    setEditUnit('');
    setEditHsnSacCode('');
    setEditTaxPercent('');
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editing) return;
    setEditSubmitting(true);
    try {
      const data = await api.patch(token, `/api/products/${editing.id}`, {
        name: editName.trim(),
        price: parseFloat(editPrice, 10) ?? 0,
        unit: editUnit.trim() || undefined,
        hsn_sac_code: editHsnSacCode.trim() || undefined,
        tax_percent: editTaxPercent !== '' && !Number.isNaN(parseFloat(editTaxPercent, 10)) ? parseFloat(editTaxPercent, 10) : undefined,
      });
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
          <input
            className="form__input"
            placeholder="Unit (e.g. pc, kg)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <input
            className="form__input"
            placeholder="HSN/SAC code"
            value={hsnSacCode}
            onChange={(e) => setHsnSacCode(e.target.value)}
            maxLength={20}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="form__input"
            placeholder="Tax % (optional)"
            value={taxPercent}
            onChange={(e) => setTaxPercent(e.target.value)}
          />
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
                  <th>Unit</th>
                  <th>HSN/SAC</th>
                  <th>Tax %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{formatMoney(p.price, tenant)}</td>
                    <td>{p.unit || '—'}</td>
                    <td>{p.hsn_sac_code || '—'}</td>
                    <td>{p.tax_percent != null ? `${p.tax_percent}%` : '—'}</td>
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
              <label className="form__label">
                <span>Unit (e.g. pc, kg)</span>
                <input
                  className="form__input"
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                />
              </label>
              <label className="form__label">
                <span>HSN/SAC code</span>
                <input
                  className="form__input"
                  placeholder="e.g. 998314"
                  value={editHsnSacCode}
                  onChange={(e) => setEditHsnSacCode(e.target.value)}
                  maxLength={20}
                />
              </label>
              <label className="form__label">
                <span>Tax % (optional, overrides tenant default)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="form__input"
                  placeholder="Leave empty for default"
                  value={editTaxPercent}
                  onChange={(e) => setEditTaxPercent(e.target.value)}
                />
              </label>
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
