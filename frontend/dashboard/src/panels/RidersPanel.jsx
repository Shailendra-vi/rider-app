export default function RidersPanel({ riders }) {
  return (
    <section className="card">
      <div className="panel-head">
        <h2>Riders</h2>
        <span className="count-pill">{riders.length}</span>
      </div>

      {riders.length === 0 ? (
        <div className="empty">No riders yet — add one from Create data.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Shift</th>
              <th>Carrying</th>
              <th>Last location</th>
            </tr>
          </thead>
          <tbody>
            {riders.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  <div className="muted small mono">{r.id}</div>
                </td>
                <td>
                  <span className={`badge badge-${r.is_online ? 'online' : 'offline'}`}>
                    {r.is_online ? 'online' : 'offline'}
                  </span>
                </td>
                <td>
                  {r.current_order_id ? (
                    <span className={`badge badge-${r.current_order_status}`}>
                      {r.current_order_status.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="muted small">
                  {r.last_lat ? `${r.last_lat}, ${r.last_lng}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">
        The rider id is what the app sends as <code>X-Rider-Id</code>. Location updates once the app
        starts sending pings.
      </p>
    </section>
  );
}
