import { useState } from 'react';
import { api } from '../api';

function todayIST() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekdaysOf(mask) {
  return DAYS.filter((_, i) => mask & (1 << i)).join(' ');
}

function currentAddress(history, onDate) {
  const applicable = (history ?? [])
    .filter((a) => a.effective_from <= onDate)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return applicable[0]?.address ?? '—';
}

function fmt(dateStr) {
  return dateStr ? new Date(dateStr).toLocaleDateString() : '—';
}

function fmtWhen(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function realEntries(list) {
  return list.filter((e) => !e.cancels);
}

function activeCount(list) {
  const cancelledIds = new Set(list.filter((e) => e.cancels).map((e) => e.cancels));
  return realEntries(list).filter((e) => !cancelledIds.has(e.id)).length;
}

function cancelledAt(entry, list) {
  return list.find((e) => e.cancels === entry.id)?.recorded_at ?? null;
}

export default function SubscriptionsPanel({ subscriptions, onAction }) {
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState({ from: todayIST(), to: todayIST(), skip: todayIST(), address: '' });
  const today = todayIST();
  const open = subscriptions.find((s) => s.id === openId);

  return (
    <section className="card">
      <div className="panel-head">
        <h2>Subscriptions</h2>
        <span className="count-pill">{subscriptions.length}</span>
      </div>

      {subscriptions.length === 0 ? (
        <div className="empty">No subscriptions yet — add one from Create data.</div>
      ) : (
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Plan</th>
            <th>Days</th>
            <th>Address today</th>
            <th>History</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((s) => (
            <tr key={s.id}>
              <td>
                {s.customer_name}
                {!s.is_active && <span className="muted small"> (cancelled)</span>}
              </td>
              <td className="small">{s.plan_code}</td>
              <td className="small nowrap">{weekdaysOf(s.weekday_mask)}</td>
              <td className="muted small">{currentAddress(s.address_history, today)}</td>
              <td>
                <div className="pills" style={{ marginBottom: 0 }}>
                  {activeCount(s.pauses) > 0 && <span className="pill">{activeCount(s.pauses)} pause</span>}
                  {activeCount(s.skips) > 0 && <span className="pill">{activeCount(s.skips)} skip</span>}
                  {s.address_history.length > 1 && <span className="pill">{s.address_history.length} addr</span>}
                  {activeCount(s.pauses) === 0 && activeCount(s.skips) === 0 && s.address_history.length <= 1 && (
                    <span className="muted small">—</span>
                  )}
                </div>
              </td>
              <td>
                <button className={openId === s.id ? '' : 'primary'} onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                  {openId === s.id ? 'Close' : 'Change'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}

      {open && (
        <div className="editor">
          <h3>History — {open.customer_name}</h3>
          <p className="hint">
            Every change is <b>appended</b> — nothing is overwritten, so "what was true on a past
            date" stays answerable. An exact-duplicate entry is rejected, not silently added twice.
          </p>

          {realEntries(open.pauses).length === 0 &&
          realEntries(open.skips).length === 0 &&
          open.address_history.length <= 1 ? (
            <div className="empty">No pauses, skips, or address changes recorded yet.</div>
          ) : (
            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Details</th>
                  <th>Recorded</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {realEntries(open.pauses).map((p) => {
                  const cancelled = cancelledAt(p, open.pauses);
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="badge badge-PREPARING">pause</span>
                      </td>
                      <td className="small">
                        {fmt(p.from_date)} → {fmt(p.to_date)}
                      </td>
                      <td className="muted small">{fmtWhen(p.recorded_at)}</td>
                      <td className="small">
                        {cancelled ? (
                          <span className="muted">Cancelled {fmtWhen(cancelled)}</span>
                        ) : (
                          <span className="badge badge-online">active</span>
                        )}
                      </td>
                      <td>
                        {!cancelled && (
                          <button onClick={() => onAction(() => api.cancelSubscriptionEvent(openId, 'pause', p.id))}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {realEntries(open.skips).map((s) => {
                  const cancelled = cancelledAt(s, open.skips);
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className="badge badge-CANCELLED">skip</span>
                      </td>
                      <td className="small">{fmt(s.service_date)}</td>
                      <td className="muted small">{fmtWhen(s.recorded_at)}</td>
                      <td className="small">
                        {cancelled ? (
                          <span className="muted">Cancelled {fmtWhen(cancelled)}</span>
                        ) : (
                          <span className="badge badge-online">active</span>
                        )}
                      </td>
                      <td>
                        {!cancelled && (
                          <button onClick={() => onAction(() => api.cancelSubscriptionEvent(openId, 'skip', s.id))}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {open.address_history.map((a, i) => (
                  <tr key={`addr-${i}`}>
                    <td>
                      <span className="badge badge-CONFIRMED">address</span>
                    </td>
                    <td className="small">
                      {a.address} <span className="muted">(from {fmt(a.effective_from)})</span>
                    </td>
                    <td className="muted small">{fmtWhen(a.recorded_at)}</td>
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Add a change</h3>

          <div className="formrow">
            <label>
              Pause from
              <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </label>
            <label>
              to
              <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </label>
            <button
              onClick={() =>
                onAction(() => api.addSubscriptionEvent(openId, 'pause', { from_date: form.from, to_date: form.to }))
              }
            >
              Add pause
            </button>
          </div>

          <div className="formrow">
            <label>
              Skip date
              <input type="date" value={form.skip} onChange={(e) => setForm({ ...form, skip: e.target.value })} />
            </label>
            <button onClick={() => onAction(() => api.addSubscriptionEvent(openId, 'skip', { service_date: form.skip }))}>
              Add skip
            </button>
          </div>

          <div className="formrow">
            <label>
              New address
              <input
                value={form.address}
                placeholder="H-9, Sector 137, Noida"
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <label>
              effective from
              <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </label>
            <button
              disabled={!form.address}
              onClick={() =>
                onAction(() =>
                  api.addSubscriptionEvent(openId, 'address', { address: form.address, effective_from: form.from }),
                )
              }
            >
              Change address
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
