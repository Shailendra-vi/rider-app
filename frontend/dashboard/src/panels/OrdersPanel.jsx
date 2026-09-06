import { api } from '../api';

export default function OrdersPanel({ orders, serviceDate, onAction }) {
  const counts = orders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});

  return (
    <section className="card">
      <div className="panel-head">
        <h2>Orders for {serviceDate}</h2>
        <span className="count-pill">{orders.length}</span>
      </div>

      {orders.length > 0 && (
        <div className="pills">
          {Object.entries(counts).map(([status, n]) => (
            <span key={status} className={`badge badge-${status}`}>
              {status.replace(/_/g, ' ')} · {n}
            </span>
          ))}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="empty">Nothing yet — hit "Generate orders" above.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Address</th>
              <th>Status</th>
              <th>Rider</th>
              <th>Advance</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.customer_name}</td>
                <td className="muted small">{o.delivery_address}</td>
                <td>
                  <span className={`badge badge-${o.status}`}>{o.status.replace(/_/g, ' ')}</span>
                </td>
                <td>{o.rider_name ?? <span className="muted">—</span>}</td>
                <td className="actions">
                  {o.allowedTransitions.length === 0 ? (
                    <span className="muted small">terminal</span>
                  ) : (
                    o.allowedTransitions.map((to) => (
                      <button key={to} onClick={() => onAction(() => api.transition(o.id, to))}>
                        {to.replace(/_/g, ' ')}
                      </button>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint">
        Buttons come from the server's <code>allowedTransitions</code> — the dashboard can't offer an
        illegal move. Move an order to <b>PREPARING</b> to make it claimable from the rider app.
      </p>
    </section>
  );
}
