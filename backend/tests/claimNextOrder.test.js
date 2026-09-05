import { describe, it, expect } from 'vitest';
import { pool } from '../src/db/pool.js';
import { claimNextOrder } from '../src/riders/claimNextOrder.js';

async function seedPlanAndCustomer() {
  const { rows: plan } = await pool.query(
    `INSERT INTO plans (code, name, meal_slot, price_paise)
     VALUES ('WEEKDAY_LUNCH_VEG', 'Weekday Lunch Veg', 'LUNCH', 12000) RETURNING id`,
  );
  const { rows: customer } = await pool.query(
    `INSERT INTO customers (name, phone) VALUES ('Test Customer', '+919876500001') RETURNING id`,
  );
  const { rows: subscription } = await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask)
     VALUES ($1, $2, '2020-01-01', 127) RETURNING id`,
    [customer[0].id, plan[0].id],
  );
  return { planId: plan[0].id, customerId: customer[0].id, subscriptionId: subscription[0].id };
}



async function seedReadyOrder(subscriptionId, customerId, serviceDate) {
  const { rows } = await pool.query(
    `INSERT INTO orders (subscription_id, customer_id, service_date, status, price_paise, delivery_address)
     VALUES ($1, $2, $3, 'PREPARING', 12000, 'Test Address') RETURNING id`,
    [subscriptionId, customerId, serviceDate],
  );
  return rows[0].id;
}

async function seedRider(phone) {
  const { rows } = await pool.query(`INSERT INTO riders (name, phone) VALUES ('Test Rider', $1) RETURNING id`, [phone]);
  return rows[0].id;
}




describe('claimNextOrder', () => {
  it('assigns a ready order to a rider', async () => {
    const { subscriptionId, customerId } = await seedPlanAndCustomer();
    const orderId = await seedReadyOrder(subscriptionId, customerId, '2025-08-12');
    const riderId = await seedRider('+919000000001');

    const order = await claimNextOrder(riderId);
    expect(order.id).toBe(orderId);
    expect(order.rider_id).toBe(riderId);
  });



  it('returns 204-worthy null when nothing is ready', async () => {
    const riderId = await seedRider('+919000000002');
    const order = await claimNextOrder(riderId);
    expect(order).toBeNull();
  });


  it('never assigns the same order to two riders under a stampede', async () => {
    const { subscriptionId, customerId } = await seedPlanAndCustomer();
    const orderId = await seedReadyOrder(subscriptionId, customerId, '2025-08-12');

    const riderIds = await Promise.all(
      Array.from({ length: 20 }, (_, i) => seedRider(`+91900000${1000 + i}`)),
    );


    const results = await Promise.all(riderIds.map((riderId) => claimNextOrder(riderId)));
    const winners = results.filter((r) => r !== null);

    expect(winners).toHaveLength(1);
    expect(winners[0].id).toBe(orderId);


    const { rows: claims } = await pool.query(
      'SELECT count(*) FROM deliveries WHERE order_id = $1 AND released_at IS NULL',
      [orderId],
    );
    expect(Number(claims[0].count)).toBe(1);
  });



  it('gives every rider a different order when many are ready', async () => {
    const { subscriptionId, customerId } = await seedPlanAndCustomer();
    const orderIds = await Promise.all(
      Array.from({ length: 10 }, (_, i) => seedReadyOrder(subscriptionId, customerId, `2025-08-${12 + i}`)),
    );
    const riderIds = await Promise.all(Array.from({ length: 10 }, (_, i) => seedRider(`+91900001${1000 + i}`)));

    const results = await Promise.all(riderIds.map((riderId) => claimNextOrder(riderId)));

    expect(results.every((r) => r !== null)).toBe(true);
    expect(new Set(results.map((r) => r.id)).size).toBe(orderIds.length);
  });



  it('a double-tap from the same rider claims only one order', async () => {
    const { subscriptionId, customerId } = await seedPlanAndCustomer();
    await seedReadyOrder(subscriptionId, customerId, '2025-08-12');
    await seedReadyOrder(subscriptionId, customerId, '2025-08-13');
    const riderId = await seedRider('+919000000099');

    const [a, b] = await Promise.all([claimNextOrder(riderId), claimNextOrder(riderId)]);
    expect(a.id).toBe(b.id);

    const { rows } = await pool.query(
      'SELECT count(*) FROM deliveries WHERE rider_id = $1 AND released_at IS NULL',
      [riderId],
    );
    expect(Number(rows[0].count)).toBe(1);
  });
  

  it('reclaims an order once the ghost rider’s lease has expired, fencing the old claim', async () => {
    const { subscriptionId, customerId } = await seedPlanAndCustomer();
    const orderId = await seedReadyOrder(subscriptionId, customerId, '2025-08-12');
    const riderA = await seedRider('+919000000010');
    const riderB = await seedRider('+919000000011');

    const first = await claimNextOrder(riderA);
    expect(first.id).toBe(orderId);

    // Rider A goes dark: force their lease into the past instead of waiting 15 minutes.
    await pool.query("UPDATE deliveries SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [orderId]);

    const second = await claimNextOrder(riderB);
    expect(second.id).toBe(orderId);
    expect(second.rider_id).toBe(riderB);

    const { rows: claims } = await pool.query(
      'SELECT rider_id, released_at, release_reason FROM deliveries WHERE order_id = $1 ORDER BY claimed_at',
      [orderId],
    );
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({ rider_id: riderA, release_reason: 'EXPIRED' });
    expect(claims[0].released_at).not.toBeNull();
    expect(claims[1]).toMatchObject({ rider_id: riderB, released_at: null });
  });
});
