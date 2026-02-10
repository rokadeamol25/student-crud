import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../api/client';
import { formatMoney } from '../lib/format';
import ListSkeleton from '../components/ListSkeleton';

const emptyItem = () => ({ product_id: '', quantity: 1, purchase_price: 0 });

const TRACKING_LABELS = { quantity: 'Qty', serial: 'Serial', batch: 'Batch' };

function itemFromRow(row) {
  return {
    product_id: row.product_id || '',
    quantity: Number(row.quantity) || 1,
    purchase_price: Number(row.purchase_price) || 0,
  };
}

function TrackingBadge({ type }) {
  const t = type || 'quantity';
  const colors = { quantity: 'badge--draft', serial: 'badge--sent', batch: 'badge--paid' };
  return <span className={`badge ${colors[t] || ''}`} style={{ fontSize: '0.7rem' }}>{TRACKING_LABELS[t]}</span>;
}

export default function PurchaseBill() {
  const { id } = useParams();
  const { token, tenant } = useAuth();
  const defaultTrackingType = tenant?.feature_config?.defaultTrackingType || 'quantity';
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [recordConfirm, setRecordConfirm] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Serial/batch entry for recording
  const [recordModal, setRecordModal] = useState(false);
  const [serialInputs, setSerialInputs] = useState({}); // product_id -> string (newline-separated)
  const [batchInputs, setBatchInputs] = useState({}); // product_id -> { batch_number, expiry_date }
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'cash',
    reference: '',
    paid_at: new Date().toISOString().slice(0, 10),
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);

  const fetchBill = useCallback(() => {
    if (!token || !id) return;
    return api.get(token, `/api/purchase-bills/${id}`)
      .then((data) => {
        setBill(data);
        if (data?.status === 'draft') {
          const items = (data.items || []).length ? (data.items || []).map(itemFromRow) : [emptyItem()];
          setEditForm({
            supplierId: data.supplier_id || data.supplier?.id || '',
            billNumber: data.bill_number || '',
            billDate: data.bill_date || '',
            items,
          });
        } else {
          setEditForm(null);
        }
      })
      .catch((e) => setError(e.message));
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    fetchBill().finally(() => setLoading(false));
  }, [token, id, fetchBill]);

  useEffect(() => {
    if (!token || !bill) return;
    Promise.all([
      api.get(token, '/api/suppliers?limit=500'),
      api.get(token, '/api/products?limit=500'),
    ]).then(([sRes, pRes]) => {
      setSuppliers(sRes?.data ?? []);
      setProducts(pRes?.data ?? []);
    }).catch(() => {});
  }, [token, bill]);

  function updateEditLine(i, field, value) {
    if (!editForm) return;
    setEditForm((prev) => {
      const next = { ...prev, items: [...prev.items] };
      next.items[i] = { ...next.items[i], [field]: value };
      if (field === 'product_id' && value) {
        const product = products.find((p) => p.id === value);
        if (product?.purchase_price != null) next.items[i].purchase_price = product.purchase_price;
        else if (product?.last_purchase_price != null) next.items[i].purchase_price = product.last_purchase_price;
        else if (product?.price != null) next.items[i].purchase_price = product.price;
      }
      return next;
    });
  }

  function addEditLine() {
    if (!editForm) return;
    setEditForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function removeEditLine(idx) {
    if (!editForm || editForm.items.length <= 1) return;
    setEditForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editForm || !bill || bill.status !== 'draft') return;
    setEditSubmitting(true);
    try {
      const validItems = editForm.items
        .filter((it) => (it.product_id || '').toString().trim() && (Number(it.quantity) || 0) > 0)
        .map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity),
          purchase_price: Number(it.purchase_price) || 0,
        }));
      if (validItems.length === 0) {
        showToast('Add at least one item with product and quantity', 'error');
        setEditSubmitting(false);
        return;
      }
      const updated = await api.patch(token, `/api/purchase-bills/${id}`, {
        supplier_id: editForm.supplierId,
        bill_number: editForm.billNumber.trim(),
        bill_date: editForm.billDate,
        items: validItems,
      });
      setBill(updated);
      setEditForm({
        supplierId: updated.supplier_id,
        billNumber: updated.bill_number,
        billDate: updated.bill_date,
        items: (updated.items || []).map(itemFromRow),
      });
      showToast('Purchase bill updated', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to update', 'error');
    } finally {
      setEditSubmitting(false);
    }
  }

  function needsExtraInput() {
    if (!editForm) return false;
    return editForm.items.some((it) => {
      const prod = products.find((p) => p.id === it.product_id);
      return prod && (prod.tracking_type === 'serial' || prod.tracking_type === 'batch');
    });
  }

  function openRecordFlow() {
    if (needsExtraInput()) {
      // Prepare serial/batch input state
      const si = {};
      const bi = {};
      for (const it of (editForm?.items || [])) {
        const prod = products.find((p) => p.id === it.product_id);
        if (!prod) continue;
        if (prod.tracking_type === 'serial') {
          si[it.product_id] = si[it.product_id] || '';
        }
        if (prod.tracking_type === 'batch') {
          bi[it.product_id] = bi[it.product_id] || { batch_number: '', expiry_date: '' };
        }
      }
      setSerialInputs(si);
      setBatchInputs(bi);
      setRecordModal(true);
    } else {
      setRecordConfirm(true);
    }
  }

  async function handleRecord() {
    setRecordConfirm(false);
    setRecordModal(false);
    setRecording(true);
    try {
      // Build serials map: product_id -> string[]
      const serials = {};
      for (const [pid, text] of Object.entries(serialInputs)) {
        const lines = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
        if (lines.length > 0) serials[pid] = lines;
      }
      // Build batches map: product_id -> { batch_number, expiry_date }
      const batches = {};
      for (const [pid, info] of Object.entries(batchInputs)) {
        if (info.batch_number?.trim()) {
          batches[pid] = { batch_number: info.batch_number.trim(), expiry_date: info.expiry_date || null };
        }
      }
      const updated = await api.post(token, `/api/purchase-bills/${id}/record`, { serials, batches });
      setBill(updated);
      setEditForm(null);
      showToast('Purchase bill recorded; stock updated', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to record', 'error');
    } finally {
      setRecording(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.del(token, `/api/purchase-bills/${id}`);
      showToast('Purchase bill deleted', 'success');
      navigate('/purchase-bills');
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function openPaymentModal() {
    const balance = Number(bill?.balance) ?? (Number(bill?.total) - Number(bill?.amount_paid ?? 0));
    setPaymentForm({
      amount: balance > 0 ? String(balance) : '',
      payment_method: 'cash',
      reference: '',
      paid_at: new Date().toISOString().slice(0, 10),
    });
    setPaymentModalOpen(true);
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    const amount = parseFloat(paymentForm.amount, 10);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setPaymentSubmitting(true);
    try {
      await api.post(token, `/api/purchase-bills/${id}/payments`, {
        amount,
        payment_method: paymentForm.payment_method,
        reference: (paymentForm.reference || '').trim() || undefined,
        paid_at: paymentForm.paid_at || undefined,
      });
      setPaymentModalOpen(false);
      fetchBill();
      showToast('Payment recorded', 'success');
    } catch (e) {
      showToast(e?.message || 'Failed to record payment', 'error');
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function handleDeletePayment(paymentId) {
    setDeletingPaymentId(paymentId);
    try {
      await api.del(token, `/api/purchase-bills/${id}/payments/${paymentId}`);
      fetchBill();
      showToast('Payment removed', 'success');
    } catch (e) {
      showToast(e?.message || 'Failed to remove payment', 'error');
    } finally {
      setDeletingPaymentId(null);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h1 className="page__title">Purchase bill</h1>
        <div className="card page__section">
          <ListSkeleton rows={5} columns={3} />
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="page">
        <h1 className="page__title">Purchase bill</h1>
        <p className="page__error">{error || 'Bill not found'}</p>
        <Link to="/purchase-bills" className="btn btn--secondary">Back to Purchase bills</Link>
      </div>
    );
  }

  const isDraft = bill.status === 'draft';
  const balance = Number(bill.balance) ?? (Number(bill.total) - Number(bill.amount_paid ?? 0));
  const payments = bill.payments || [];
  const draftItemsWithType = (editForm?.items || []).map((it) => ({ ...it, product: products.find((p) => p.id === it.product_id) }));
  const hasSerialOrBatch = draftItemsWithType.some((it) => it.product?.tracking_type === 'serial' || it.product?.tracking_type === 'batch');

  return (
    <div className="page">
      <div className="page__toolbar" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link to="/purchase-bills" className="btn btn--ghost btn--sm">← Purchase bills</Link>
        {bill.supplier?.id && (
          <Link to={`/suppliers/${bill.supplier.id}/ledger`} className="btn btn--ghost btn--sm">Supplier ledger</Link>
        )}
        <Link to={`/purchase-bills/${id}/print`} className="btn btn--secondary btn--sm">Print / Download PDF</Link>
      </div>
      <h1 className="page__title">Purchase bill — {bill.bill_number}</h1>
      <p className="page__muted">Supplier: {bill.supplier?.name ?? '—'} · Date: {bill.bill_date} · Status: {bill.status}</p>
      <p className="page__muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
        Product type from Settings: <TrackingBadge type={defaultTrackingType} /> — Serial/Batch lines need details when you Record.
      </p>

      {isDraft && editForm && (
        <section className="card page__section">
          <h2 className="card__heading">Edit draft</h2>
          {hasSerialOrBatch && (
            <p className="page__muted" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
              Some products are Serial or Batch — you will enter serial numbers or batch/expiry when you click Record bill.
            </p>
          )}
          <form onSubmit={handleEditSubmit}>
            <div className="form form--grid">
              <label className="form__label">
                <span>Supplier</span>
                <select
                  className="form__input"
                  value={editForm.supplierId}
                  onChange={(e) => setEditForm((p) => ({ ...p, supplierId: e.target.value }))}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="form__label">
                <span>Bill number</span>
                <input
                  type="text"
                  className="form__input"
                  value={editForm.billNumber}
                  onChange={(e) => setEditForm((p) => ({ ...p, billNumber: e.target.value }))}
                  required
                />
              </label>
              <label className="form__label">
                <span>Bill date</span>
                <input
                  type="date"
                  className="form__input"
                  value={editForm.billDate}
                  onChange={(e) => setEditForm((p) => ({ ...p, billDate: e.target.value }))}
                  required
                />
              </label>
            </div>
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Purchase price</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {editForm.items.map((it, i) => {
                    const product = products.find((p) => p.id === it.product_id);
                    return (
                    <tr key={i}>
                      <td>
                        <select
                          className="form__input form__input--sm"
                          value={it.product_id}
                          onChange={(e) => updateEditLine(i, 'product_id', e.target.value)}
                          required
                        >
                          <option value="">Select product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>{product ? <TrackingBadge type={product.tracking_type} /> : '—'}</td>
                      <td>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="form__input form__input--sm form__input--narrow"
                          value={it.quantity}
                          onChange={(e) => updateEditLine(i, 'quantity', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form__input form__input--sm form__input--narrow"
                          value={it.purchase_price}
                          onChange={(e) => updateEditLine(i, 'purchase_price', e.target.value)}
                        />
                      </td>
                      <td>{formatMoney((Number(it.quantity) || 0) * (Number(it.purchase_price) || 0), tenant)}</td>
                      <td>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeEditLine(i)}>Remove</button>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn--secondary" style={{ marginTop: '0.5rem' }} onClick={addEditLine}>Add line</button>
            <div className="modal__actions" style={{ marginTop: '1rem' }}>
              <button type="submit" className="btn btn--primary" disabled={editSubmitting}>
                {editSubmitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card page__section">
        <h2 className="card__heading">Items</h2>
        {(!bill.items || bill.items.length === 0) ? (
          <p className="page__muted">No items.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Purchase price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((it, i) => {
                  const product = products.find((p) => p.id === it.product_id);
                  return (
                  <tr key={it.id || i}>
                    <td>{product?.name ?? it.product_id}</td>
                    <td>{product ? <TrackingBadge type={product.tracking_type} /> : '—'}</td>
                    <td>{it.quantity}</td>
                    <td>{formatMoney(it.purchase_price, tenant)}</td>
                    <td>{formatMoney(it.amount, tenant)}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
        <p><strong>Total: {formatMoney(bill.total, tenant)}</strong></p>
        {!isDraft && (
          <p className="page__muted">Amount paid: {formatMoney(bill.amount_paid, tenant)} · Balance: {formatMoney(balance, tenant)}</p>
        )}
      </section>

      {isDraft && (
        <div style={{ marginTop: '1rem' }}>
          {hasSerialOrBatch && (
            <p className="page__muted" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              This bill has Serial or Batch products — click Record to enter serial numbers or batch/expiry.
            </p>
          )}
          <div className="page__toolbar" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--primary" onClick={openRecordFlow} disabled={recording}>
            {recording ? 'Recording…' : 'Record bill (update stock)'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete draft'}
          </button>
          </div>
        </div>
      )}

      {!isDraft && (
        <section className="card page__section" style={{ marginTop: '1rem' }}>
          <h3 className="card__subheading">Payments</h3>
          {payments.length > 0 && (
            <table className="table" style={{ marginBottom: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.paid_at}</td>
                    <td>{String(p.payment_method).replace('_', ' ')}</td>
                    <td>{formatMoney(p.amount, tenant)}</td>
                    <td>{p.reference || '—'}</td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDeletePayment(p.id)} disabled={deletingPaymentId === p.id}>
                        {deletingPaymentId === p.id ? '…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {balance > 0 && (
            <button type="button" className="btn btn--secondary btn--sm" onClick={openPaymentModal}>
              Record payment
            </button>
          )}
        </section>
      )}

      {recordConfirm && (
        <div className="modal-backdrop" onClick={() => setRecordConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Record purchase bill</h2>
            <p>Record this bill? Stock and last purchase price will be updated for all items. This cannot be undone.</p>
            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setRecordConfirm(false)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={handleRecord} disabled={recording}>
                {recording ? 'Recording…' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Serial/Batch collection modal */}
      {recordModal && (
        <div className="modal-backdrop" onClick={() => setRecordModal(false)}>
          <div className="modal" style={{ maxWidth: '32rem' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Enter serial / batch details</h2>
            <p className="page__muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              Some products require additional information before recording.
            </p>
            {Object.keys(serialInputs).map((pid) => {
              const prod = products.find((p) => p.id === pid);
              const item = (editForm?.items || []).find((it) => it.product_id === pid);
              const qty = Number(item?.quantity) || 0;
              const entered = (serialInputs[pid] || '').split(/[\n,]+/).filter((s) => s.trim()).length;
              return (
                <div key={pid} className="form__label" style={{ marginBottom: '1rem' }}>
                  <span><strong>{prod?.name || 'Product'}</strong> — enter {qty} serial number(s) ({entered}/{qty})</span>
                  <textarea
                    className="form__input"
                    rows={Math.min(qty, 6)}
                    placeholder="One serial/IMEI per line"
                    value={serialInputs[pid] || ''}
                    onChange={(e) => setSerialInputs((prev) => ({ ...prev, [pid]: e.target.value }))}
                  />
                </div>
              );
            })}
            {Object.keys(batchInputs).map((pid) => {
              const prod = products.find((p) => p.id === pid);
              return (
                <div key={pid} style={{ marginBottom: '1rem' }}>
                  <span className="form__label"><strong>{prod?.name || 'Product'}</strong> — batch details</span>
                  <div className="form form--grid" style={{ gap: '0.5rem', marginTop: '0.25rem' }}>
                    <label className="form__label">
                      <span>Batch number</span>
                      <input
                        className="form__input"
                        placeholder="e.g. B2026-03"
                        value={batchInputs[pid]?.batch_number || ''}
                        onChange={(e) => setBatchInputs((prev) => ({ ...prev, [pid]: { ...prev[pid], batch_number: e.target.value } }))}
                        required
                      />
                    </label>
                    <label className="form__label">
                      <span>Expiry date (optional)</span>
                      <input
                        type="date"
                        className="form__input"
                        value={batchInputs[pid]?.expiry_date || ''}
                        onChange={(e) => setBatchInputs((prev) => ({ ...prev, [pid]: { ...prev[pid], expiry_date: e.target.value } }))}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="modal__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setRecordModal(false)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={handleRecord} disabled={recording}>
                {recording ? 'Recording…' : 'Record bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModalOpen && (
        <div className="modal-backdrop" onClick={() => setPaymentModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '22rem' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Record payment</h2>
            <form onSubmit={handleRecordPayment}>
              <label className="form__label">
                <span>Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form__input"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </label>
              <label className="form__label">
                <span>Method</span>
                <select
                  className="form__input"
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank transfer</option>
                </select>
              </label>
              <label className="form__label">
                <span>Date</span>
                <input
                  type="date"
                  className="form__input"
                  value={paymentForm.paid_at}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, paid_at: e.target.value }))}
                />
              </label>
              <label className="form__label">
                <span>Reference (optional)</span>
                <input
                  type="text"
                  className="form__input"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                />
              </label>
              <div className="modal__actions">
                <button type="submit" className="btn btn--primary" disabled={paymentSubmitting}>
                  {paymentSubmitting ? 'Saving…' : 'Record payment'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setPaymentModalOpen(false)} disabled={paymentSubmitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
