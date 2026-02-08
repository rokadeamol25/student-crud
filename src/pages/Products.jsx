import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';

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
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

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
      });
      setName('');
      setPrice('');
      setUnit('');
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
  }

  function closeEdit() {
    setEditing(null);
    setEditName('');
    setEditPrice('');
    setEditUnit('');
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

  async function handleDelete(p) {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    setError('');
    try {
      await api.del(token, `/api/products/${p.id}`);
      setList((prev) => prev.filter((x) => x.id !== p.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast('Product deleted', 'success');
    } catch (e) {
      if (e.status === 409) {
        showToast(e.message || 'Cannot delete: product is used in invoices', 'error');
      } else {
        setError(e.message || 'Failed to delete');
      }
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
      <section className="card page__section">
        <h2 className="card__heading">Add product</h2>
        <form onSubmit={handleAdd} className="form form--inline">
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
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            Add
          </button>
        </form>
      </section>
      <section className="card page__section">
        <h2 className="card__heading">All products</h2>
        {loading ? (
          <p className="page__muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="page__muted">No products yet. Add one above.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Unit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{formatMoney(p.price, tenant)}</td>
                    <td>{p.unit || '—'}</td>
                    <td>
                      <span className="table-actions">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(p)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => handleDelete(p)}>
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
