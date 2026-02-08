import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api/client';

export default function Customers() {
  const { token } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.get(token, `/api/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`)
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, search]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(token, '/api/customers', {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      });
      setName('');
      setEmail('');
      setPhone('');
      setAddress('');
      api.get(token, `/api/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`).then(setList);
    } catch (e) {
      setError(e.message || 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Customers</h1>
      <div className="page__toolbar">
        <input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form__input page__search"
        />
      </div>
      {error && <div className="page__error">{error}</div>}
      <section className="card page__section">
        <h2 className="card__heading">Add customer</h2>
        <form onSubmit={handleAdd} className="form form--grid">
          <label className="form__label">
            <span>Name</span>
            <input className="form__input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="form__label">
            <span>Email</span>
            <input type="email" className="form__input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="form__label">
            <span>Phone</span>
            <input type="tel" className="form__input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="form__label form__label--full">
            <span>Address</span>
            <textarea className="form__input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              Add customer
            </button>
          </div>
        </form>
      </section>
      <section className="card page__section">
        <h2 className="card__heading">All customers</h2>
        {loading ? (
          <p className="page__muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="page__muted">No customers yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
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
