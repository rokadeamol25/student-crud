import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import EmptyState from '../components/EmptyState';
import ListSkeleton from '../components/ListSkeleton';

const PAGE_SIZE = 20;

export default function Customers() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const addFormRef = useRef(null);

  const fetchList = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    return api.get(token, `/api/customers?${params.toString()}`)
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
      const data = await api.post(token, '/api/customers', {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      });
      setName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setList((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      showToast('Customer added', 'success');
    } catch (e) {
      setError(e.message || 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(c) {
    setEditing(c);
    setEditName(c.name);
    setEditEmail(c.email || '');
    setEditPhone(c.phone || '');
    setEditAddress(c.address || '');
  }

  function closeEdit() {
    setEditing(null);
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editing) return;
    setEditSubmitting(true);
    try {
      const data = await api.patch(token, `/api/customers/${editing.id}`, {
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        address: editAddress.trim() || undefined,
      });
      setList((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      closeEdit();
      showToast('Customer updated', 'success');
    } catch (e) {
      setError(e.message || 'Failed to update');
    } finally {
      setEditSubmitting(false);
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
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="form__input page__search"
        />
      </div>
      {error && <div className="page__error">{error}</div>}
      <section className="card page__section" ref={addFormRef}>
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
          <ListSkeleton rows={6} columns={4} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add customers to bill on invoices."
            actionLabel="Add customer"
            onAction={() => addFormRef.current?.scrollIntoView?.({ behavior: 'smooth' })}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(c)}>
                        Edit
                      </button>
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
            <h2 className="modal__title">Edit customer</h2>
            <form onSubmit={handleEditSubmit}>
              <label className="form__label">
                <span>Name</span>
                <input className="form__input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </label>
              <label className="form__label">
                <span>Email</span>
                <input type="email" className="form__input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </label>
              <label className="form__label">
                <span>Phone</span>
                <input type="tel" className="form__input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </label>
              <label className="form__label">
                <span>Address</span>
                <textarea className="form__input" rows={2} value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
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
