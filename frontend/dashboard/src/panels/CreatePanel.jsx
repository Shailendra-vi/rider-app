import { useState } from 'react';
import { api } from '../api';

function todayIST() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

const ALL_DAYS = 0b1111111;
const WEEKDAYS = 0b0011111;

export default function CreatePanel({ plans, customers, onAction }) {
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [rider, setRider] = useState({ name: '', phone: '' });
  const [plan, setPlan] = useState({ code: '', name: '', pricePaise: 12000 });
  const [sub, setSub] = useState({
    customerId: '',
    planId: '',
    startDate: todayIST(),
    weekdayMask: ALL_DAYS,
    address: '',
  });

  return (
    <section className="card">
      <div className="panel-head">
        <h2>Create test data</h2>
      </div>

      <div className="grid">

        <div className="box">
          <h3>Customer</h3>

          <input placeholder="Name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          <input placeholder="Phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />

          <button
            className="primary"
            disabled={!customer.name || !customer.phone}
            onClick={() => onAction(async () => { await api.createCustomer(customer); setCustomer({ name: '', phone: '' }); })}
          >
            Add customer
          </button>
        </div>

        <div className="box">
          <h3>Rider</h3>

          <input placeholder="Name" value={rider.name} onChange={(e) => setRider({ ...rider, name: e.target.value })} />
          <input placeholder="Phone" value={rider.phone} onChange={(e) => setRider({ ...rider, phone: e.target.value })} />
          
          <button
            className="primary"
            disabled={!rider.name || !rider.phone}
            onClick={() => onAction(async () => { await api.createRider(rider); setRider({ name: '', phone: '' }); })}
          >
            Add rider
          </button>
        </div>

        <div className="box">
          <h3>Plan</h3>
          <input placeholder="Code e.g. WEEKDAY_LUNCH_VEG" value={plan.code} onChange={(e) => setPlan({ ...plan, code: e.target.value })} />
          <input placeholder="Name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
          
          <input
            type="number"
            placeholder="Price in paise"
            value={plan.pricePaise}
            onChange={(e) => setPlan({ ...plan, pricePaise: Number(e.target.value) })}
          />

          <span className="muted small">₹{(plan.pricePaise / 100).toFixed(2)} — money is stored in paise, never decimals</span>
          
          <button
            className="primary"
            disabled={!plan.code || !plan.name}
            onClick={() => onAction(async () => { await api.createPlan(plan); setPlan({ code: '', name: '', pricePaise: 12000 }); })}
          >
            Add plan
          </button>
        </div>

        <div className="box wide">
          <h3>Subscription</h3>
          <select value={sub.customerId} onChange={(e) => setSub({ ...sub, customerId: e.target.value })}>
            <option value="">Choose customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>


          <select value={sub.planId} onChange={(e) => setSub({ ...sub, planId: e.target.value })}>
            <option value="">Choose plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — ₹{(p.price_paise / 100).toFixed(0)}</option>
            ))}
          </select>


          <input placeholder="Delivery address" value={sub.address} onChange={(e) => setSub({ ...sub, address: e.target.value })} />

          <div className="formrow">
            <label>
              Start
              <input type="date" value={sub.startDate} onChange={(e) => setSub({ ...sub, startDate: e.target.value })} />
            </label>
            <label>
              Days
              <select value={sub.weekdayMask} onChange={(e) => setSub({ ...sub, weekdayMask: Number(e.target.value) })}>
                <option value={ALL_DAYS}>Every day</option>
                <option value={WEEKDAYS}>Mon–Fri</option>
              </select>
            </label>
          </div>

          
          <button
            className="primary"
            disabled={!sub.customerId || !sub.planId || !sub.address}
            onClick={() => onAction(async () => { await api.createSubscription(sub); setSub({ ...sub, address: '' }); })}
          >
            Add subscription
          </button>
        </div>
      </div>
    </section>
  );
}
