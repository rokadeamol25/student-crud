import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';

export default function Products() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.get(token, `/api/products${search ? `?q=${encodeURIComponent(search)}` : ''}`)
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, search]);

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
          onChange={(e) => setSearch(e.target.value)}
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
                    <td>{Number(p.price).toFixed(2)}</td>
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
