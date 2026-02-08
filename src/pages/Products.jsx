import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';

export default function Products() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

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
    } catch (e) {
      setError(e.message || 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  }

  function fetchList() {
    api.get(token, `/api/products${search ? `?q=${encodeURIComponent(search)}` : ''}`).then(setList);
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
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{Number(p.price).toFixed(2)}</td>
                    <td>{p.unit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
