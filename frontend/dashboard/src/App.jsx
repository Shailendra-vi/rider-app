import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import OrdersPanel from './panels/OrdersPanel';
import RidersPanel from './panels/RidersPanel';
import CreatePanel from './panels/CreatePanel';
import SubscriptionsPanel from './panels/SubscriptionsPanel';
import PaymentsPanel from './panels/PaymentsPanel';

function todayIST() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

const DATE_TABS = new Set(['orders', 'payments']);

const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'riders', label: 'Riders' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'payments', label: 'Payments' },
  { id: 'create', label: 'Create data' },
];

export default function App() {
  const [tab, setTab] = useState('orders');
  const [serviceDate, setServiceDate] = useState(todayIST);
  const [data, setData] = useState({
    orders: [],
    riders: [],
    subscriptions: [],
    plans: [],
    customers: [],
    payments: { balances: [], ledger: [] },
  });

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);



  const reload = useCallback(async () => {
    const keys = ['orders', 'riders', 'subscriptions', 'plans', 'customers', 'payments'];
    const results = await Promise.allSettled([
      api.orders(serviceDate),
      api.riders(),
      api.subscriptions(),
      api.plans(),
      api.customers(),
      api.payments(),
    ]);

    setData((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[keys[i]] = r.value;
      });
      return next;
    });

    const failures = results.map((r, i) => (r.status === 'rejected' ? `${keys[i]}: ${r.reason.message}` : null)).filter(Boolean);
    setError(failures.length > 0 ? failures.join(' · ') : null);
  }, [serviceDate]);



  useEffect(() => {
    reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);



  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">RiderApp</div>
        <div className="brand-sub">Ops dashboard</div>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`navitem ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>{TABS.find((t) => t.id === tab)?.label}</h1>
          <div className="controls">
            {DATE_TABS.has(tab) && (
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
            )}
            {tab === 'orders' && (
              <button disabled={busy} onClick={() => run(() => api.generate(serviceDate))}>
                Generate orders
              </button>
            )}
            <button className="primary" disabled={busy} onClick={reload}>
              Refresh
            </button>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {tab === 'orders' && 
          <OrdersPanel 
            orders={data.orders} 
            serviceDate={serviceDate} 
            onAction={run} 
          />}
        {tab === 'riders' && 
          <RidersPanel 
            riders={data.riders} 
          />}
          
        {tab === 'subscriptions' && 
          <SubscriptionsPanel 
            subscriptions={data.subscriptions} 
            onAction={run} 
          />}

        {tab === 'payments' && (
          <PaymentsPanel
            payments={data.payments}
            customers={data.customers}
            serviceDate={serviceDate}
            onAction={run}
          />
        )}
        {tab === 'create' && 
          <CreatePanel 
            plans={data.plans} 
            customers={data.customers} 
            onAction={run} 
          />}
      </main>
    </div>
  );
}
