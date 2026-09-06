import { useState } from 'react';
import { api } from '../api';

const TYPES = ['TOPUP', 'REFUND'];

function paise(n) {
  return `₹${(Number(n) / 100).toFixed(2)}`;
}

export default function PaymentsPanel({ payments, customers, serviceDate, onAction }) {
  const [form, setForm] = useState({ customerId: '', type: 'TOPUP', amountPaise: 10000 });
  const [reconciliation, setReconciliation] = useState(null);
  const [checking, setChecking] = useState(false);

  const runReconciliation = async () => {
    setChecking(true);
    try {
      setReconciliation(await api.reconciliation(serviceDate));
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <section className="card">
        <div className="panel-head">
          <h2>Customer balances</h2>
          <span className="count-pill">{payments.balances.length}</span>
        </div>
        {payments.balances.length === 0 ? (
          <div className="empty">No customers yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {payments.balances.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className={Number(b.balance_paise) < 0 ? 'muted' : ''}>{paise(b.balance_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2>Simulate payment webhook</h2>
        </div>
        <p className="hint">
          Signs the event with the server's own webhook secret and posts it through the real{' '}
          <code>/webhooks/payments</code> handler — the same signature check, timestamp window, and{' '}
          <code>provider_event_id</code> dedup a real provider would go through.
        </p>
        <div className="formrow">
          <label>
            Customer
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">Choose customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (paise)
            <input
              type="number"
              value={form.amountPaise}
              onChange={(e) => setForm({ ...form, amountPaise: Number(e.target.value) })}
            />
          </label>
          <button
            className="primary"
            disabled={!form.customerId || !(form.amountPaise > 0)}
            onClick={() => onAction(() => api.simulateWebhook(form))}
          >
            Send webhook event
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2>Recent ledger</h2>
          <span className="count-pill">{payments.ledger.length}</span>
        </div>
        {payments.ledger.length === 0 ? (
          <div className="empty">No payment events yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {payments.ledger.map((p) => (
                <tr key={p.id}>
                  <td>{p.customer_name}</td>
                  <td className="small">{p.type}</td>
                  <td>{paise(p.amount_paise)}</td>
                  <td className="small muted">{p.status}</td>
                  <td className="muted small">{new Date(p.occurred_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2>Reconciliation — {serviceDate}</h2>
          <button disabled={checking} onClick={runReconciliation}>
            {checking ? 'Checking…' : 'Run reconciliation'}
          </button>
        </div>
        {reconciliation === null ? (
          <div className="empty">Not run yet for this date.</div>
        ) : reconciliation.ok ? (
          <div className="empty">✓ No divergences found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.divergences.map((d, i) => (
                <tr key={i}>
                  <td>
                    <span className="badge badge-CANCELLED">{d.code}</span>
                  </td>
                  <td className="mono small">{JSON.stringify(d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">
          Pure reads only — this endpoint never writes. It's a check on whether the correctness
          claims (exactly one charge per delivered order, no orphaned claims) actually hold.
        </p>
      </section>
    </>
  );
}
