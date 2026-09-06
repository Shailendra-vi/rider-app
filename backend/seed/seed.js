import { pool } from '../src/db/pool.js';
import { istServiceDateNow, addDays } from '../src/lib/time.js';

const PLANS = [
  { id: '11111111-0000-4000-8000-000000000001', code: 'WEEKDAY_LUNCH_VEG', name: 'Weekday Lunch (Veg)', slot: 'LUNCH', price: 12000 },
  { id: '11111111-0000-4000-8000-000000000002', code: 'WEEKDAY_LUNCH_NONVEG', name: 'Weekday Lunch (Non-veg)', slot: 'LUNCH', price: 15000 },
  { id: '11111111-0000-4000-8000-000000000003', code: 'ALLDAY_LUNCH_VEG', name: 'All-week Lunch (Veg)', slot: 'LUNCH', price: 14000 },
];

const CUSTOMERS = [
  { id: '22222222-0000-4000-8000-000000000001', name: 'Asha Rao', phone: '+919810000001', address: 'B-402, Sector 62, Noida 201301' },
  { id: '22222222-0000-4000-8000-000000000002', name: 'Imran Sheikh', phone: '+919810000002', address: 'C-11, Indirapuram, Ghaziabad 201014' },
  { id: '22222222-0000-4000-8000-000000000003', name: 'Priya Nair', phone: '+919810000003', address: 'A-7, Alpha 1, Greater Noida 201310' },
  { id: '22222222-0000-4000-8000-000000000004', name: 'Rohan Gupta', phone: '+919810000004', address: 'D-19, Sector 18, Noida 201301' },
  { id: '22222222-0000-4000-8000-000000000005', name: 'Meera Iyer', phone: '+919810000005', address: 'F-3, Vaishali, Ghaziabad 201010' },
  { id: '22222222-0000-4000-8000-000000000006', name: 'Karan Mehta', phone: '+919810000006', address: 'G-22, Sector 15, Noida 201301' },
];

const RIDERS = [
  { id: '33333333-0000-4000-8000-000000000001', name: 'Vikram Singh', phone: '+918800000001' },
  { id: '33333333-0000-4000-8000-000000000002', name: 'Imran Khan', phone: '+918800000002' },
  { id: '33333333-0000-4000-8000-000000000003', name: 'Rohit Kumar', phone: '+918800000003' },
  { id: '33333333-0000-4000-8000-000000000004', name: 'Sunil Yadav', phone: '+918800000004' },
];

const WEEKDAYS = 0b0011111;
const ALL_DAYS = 0b1111111;

async function main() {
  const keep = process.argv.includes('--keep');
  const today = istServiceDateNow();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  if (!keep) {
    await pool.query(`
      TRUNCATE rider_locations, deliveries, payments, orders, subscriptions, riders, customers, plans
      RESTART IDENTITY CASCADE
    `);
  }

  for (const p of PLANS) {
    await pool.query(
      `INSERT INTO plans (id, code, name, meal_slot, price_paise) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.code, p.name, p.slot, p.price],
    );
  }

  for (const c of CUSTOMERS) {
    await pool.query(
      `INSERT INTO customers (id, name, phone) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.name, c.phone],
    );
  }

  for (const r of RIDERS) {
    await pool.query(
      `INSERT INTO riders (id, name, phone) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.phone],
    );
  }

  const subs = [
    { n: 1, customer: 0, plan: 0, mask: ALL_DAYS, start: addDays(today, -30), note: 'plain, serves every day' },
    { n: 2, customer: 1, plan: 1, mask: ALL_DAYS, start: addDays(today, -30), note: 'plain, serves every day' },
    { n: 3, customer: 2, plan: 2, mask: ALL_DAYS, start: addDays(today, -30), note: 'plain, serves every day' },
    { n: 4, customer: 3, plan: 0, mask: WEEKDAYS, start: addDays(today, -30), note: 'weekdays only — no order on Sat/Sun' },
    { n: 5, customer: 4, plan: 0, mask: ALL_DAYS, start: addDays(today, -30), note: 'PAUSED across today', pause: [yesterday, tomorrow] },
    { n: 6, customer: 5, plan: 1, mask: ALL_DAYS, start: addDays(today, -30), note: 'SKIPS today', skip: today },
    { n: 7, customer: 0, plan: 2, mask: ALL_DAYS, start: addDays(today, -30), note: 'address changes tomorrow', addressChange: tomorrow },
    { n: 8, customer: 1, plan: 0, mask: ALL_DAYS, start: addDays(today, 7), note: 'starts next week — not servable yet' },
    { n: 9, customer: 2, plan: 0, mask: ALL_DAYS, start: addDays(today, -30), note: 'cancelled', inactive: true },
  ];

  for (const s of subs) {
    const id = `44444444-0000-4000-8000-00000000000${s.n}`;
    const customer = CUSTOMERS[s.customer];

    const addressHistory = [
      { address: customer.address, effective_from: s.start, recorded_at: new Date(Date.now() - 86_400_000 * 40).toISOString() },
    ];
    if (s.addressChange) {
      addressHistory.push({
        address: `NEW ADDRESS — H-9, Sector 137, Noida 201305`,
        effective_from: s.addressChange,
        recorded_at: new Date().toISOString(),
      });
    }

    const pauses = s.pause
      ? [{ from_date: s.pause[0], to_date: s.pause[1], recorded_at: new Date(Date.now() - 86_400_000 * 2).toISOString() }]
      : [];
    const skips = s.skip
      ? [{ service_date: s.skip, recorded_at: new Date(Date.now() - 86_400_000 * 2).toISOString() }]
      : [];

    await pool.query(
      `INSERT INTO subscriptions
         (id, customer_id, plan_id, start_date, weekday_mask, is_active, pauses, skips, address_history)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        customer.id,
        PLANS[s.plan].id,
        s.start,
        s.mask,
        !s.inactive,
        JSON.stringify(pauses),
        JSON.stringify(skips),
        JSON.stringify(addressHistory),
      ],
    );
  }

  const { rows } = await pool.query(`
    SELECT (SELECT count(*) FROM plans) plans, (SELECT count(*) FROM customers) customers,
           (SELECT count(*) FROM riders) riders, (SELECT count(*) FROM subscriptions) subscriptions
  `);

  console.log(`seeded for ${today} (IST):`, rows[0]);
  console.log('scenarios:');
  for (const s of subs) console.log(`  sub #${s.n} — ${s.note}`);
  console.log('\nnext: generate orders for today, then move one to PREPARING so a rider can claim it.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
