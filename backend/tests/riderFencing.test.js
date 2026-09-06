import { describe, it, expect } from 'vitest';
import { pool } from '../src/db/pool.js';
import { claimNextOrder } from '../src/riders/claimNextOrder.js';
import { applyTransition } from '../src/orders/applyTransition.js';
import { getRiderState, setShift, recordLocations, listRiders, sendHeartbeat } from '../src/riders/service.js';
import { getOrder } from '../src/orders/getOrder.js';

async function seedReadyOrder(serviceDate = '2025-08-12') {
  const { rows: plan } = await pool.query(
    `INSERT INTO plans (code, name, meal_slot, price_paise)
     VALUES ('P_' || gen_random_uuid(), 'Plan', 'LUNCH', 12000) RETURNING id`,
  );
  const { rows: customer } = await pool.query(
    `INSERT INTO customers (name, phone) VALUES ('Cust', 'c' || gen_random_uuid()) RETURNING id`,
  );
  const { rows: sub } = await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask)
     VALUES ($1, $2, '2020-01-01', 127) RETURNING id`,
    [customer[0].id, plan[0].id],
  );
  const { rows: order } = await pool.query(
    `INSERT INTO orders (subscription_id, customer_id, service_date, status, price_paise, delivery_address)
     VALUES ($1, $2, $3, 'PREPARING', 12000, 'Test Address') RETURNING id`,
    [sub[0].id, customer[0].id, serviceDate],
  );
  return order[0].id;
}

async function seedRider(phone) {
  const { rows } = await pool.query(`INSERT INTO riders (name, phone) VALUES ('Rider', $1) RETURNING id`, [phone]);
  return rows[0].id;
}

describe('claim fencing on transitions', () => {
  it('lets the rider holding the active claim advance the order', async () => {
    await seedReadyOrder();
    const riderId = await seedRider('+919100000001');
    const claimed = await claimNextOrder(riderId);

    const moved = await applyTransition(claimed.id, 'OUT_FOR_DELIVERY', {
      riderId,
      claimId: claimed.claim_id,
    });
    expect(moved.status).toBe('OUT_FOR_DELIVERY');
  });

  it('rejects a ghost rider whose lease expired and order was reclaimed', async () => {
    const orderId = await seedReadyOrder();
    const riderA = await seedRider('+919100000002');
    const riderB = await seedRider('+919100000003');

    const claimA = await claimNextOrder(riderA);

    await pool.query("UPDATE deliveries SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [orderId]);
    const claimB = await claimNextOrder(riderB);
    expect(claimB.id).toBe(orderId);

    await expect(
      applyTransition(orderId, 'OUT_FOR_DELIVERY', { riderId: riderA, claimId: claimA.claim_id }),
    ).rejects.toMatchObject({ status: 409, code: 'STALE_CLAIM' });

    const moved = await applyTransition(orderId, 'OUT_FOR_DELIVERY', {
      riderId: riderB,
      claimId: claimB.claim_id,
    });
    expect(moved.status).toBe('OUT_FOR_DELIVERY');
  });

  it('rejects a rider acting on an order they never claimed', async () => {
    await seedReadyOrder();
    const riderA = await seedRider('+919100000004');
    const stranger = await seedRider('+919100000005');
    const claimed = await claimNextOrder(riderA);

    await expect(
      applyTransition(claimed.id, 'OUT_FOR_DELIVERY', { riderId: stranger, claimId: claimed.claim_id }),
    ).rejects.toMatchObject({ status: 409, code: 'STALE_CLAIM' });
  });

  it('still lets ops override without any claim', async () => {
    await seedReadyOrder();
    const riderId = await seedRider('+919100000006');
    const claimed = await claimNextOrder(riderId);

    const cancelled = await applyTransition(claimed.id, 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('releases the claim on a terminal state so the rider can claim again', async () => {
    await seedReadyOrder('2025-08-12');
    await seedReadyOrder('2025-08-13');
    const riderId = await seedRider('+919100000007');

    const first = await claimNextOrder(riderId);
    await applyTransition(first.id, 'OUT_FOR_DELIVERY', { riderId, claimId: first.claim_id });
    await applyTransition(first.id, 'DELIVERED', { riderId, claimId: first.claim_id });

    const { rows } = await pool.query('SELECT released_at, release_reason FROM deliveries WHERE id = $1', [
      first.claim_id,
    ]);
    expect(rows[0].released_at).not.toBeNull();
    expect(rows[0].release_reason).toBe('COMPLETED');

    const second = await claimNextOrder(riderId);
    expect(second).not.toBeNull();
    expect(second.id).not.toBe(first.id);
  });
});

describe('rider state endpoints', () => {
  it('lists riders and flips the shift flag', async () => {
    const riderId = await seedRider('+919100000008');
    expect(await listRiders()).toHaveLength(1);

    const updated = await setShift(riderId, true);
    expect(updated.is_online).toBe(true);
  });

  it('rebuilds the rider screen from server truth, with allowed transitions', async () => {
    await seedReadyOrder();
    const riderId = await seedRider('+919100000009');

    const before = await getRiderState(riderId);
    expect(before.currentOrder).toBeNull();

    const claimed = await claimNextOrder(riderId);
    const after = await getRiderState(riderId);

    expect(after.currentOrder.id).toBe(claimed.id);
    expect(after.currentOrder.claim_id).toBe(claimed.claim_id);
    expect(after.currentOrder.allowedTransitions).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
  });

  it('exposes allowedTransitions on a single order fetch', async () => {
    const orderId = await seedReadyOrder();
    const order = await getOrder(orderId);
    expect(order.allowedTransitions).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
  });
});

describe('location pings', () => {
  it('stores fresh pings, drops stale ones, and renews the lease', async () => {
    await seedReadyOrder();
    const riderId = await seedRider('+919100000010');
    const claimed = await claimNextOrder(riderId);

    const before = await pool.query('SELECT expires_at FROM deliveries WHERE id = $1', [claimed.claim_id]);
    await pool.query("UPDATE deliveries SET expires_at = now() + interval '1 minute' WHERE id = $1", [
      claimed.claim_id,
    ]);

    const result = await recordLocations(riderId, [
      { lat: 28.57, lng: 77.32, recordedAt: new Date().toISOString(), orderId: claimed.id },
      { lat: 28.58, lng: 77.33, recordedAt: new Date(Date.now() - 30 * 60_000).toISOString() },
    ]);

    expect(result.accepted).toBe(1);
    expect(result.dropped).toBe(1);

    const { rows } = await pool.query('SELECT count(*) FROM rider_locations WHERE rider_id = $1', [riderId]);
    expect(Number(rows[0].count)).toBe(1);

    const after = await pool.query('SELECT expires_at FROM deliveries WHERE id = $1', [claimed.claim_id]);
    expect(new Date(after.rows[0].expires_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0].expires_at).getTime() - 1000,
    );
  });
});

describe('retry safety on a dropped network', () => {
  it('treats a repeated DELIVERED from the same rider as success, not a conflict', async () => {
    await seedReadyOrder();
    const riderId = await seedRider('+919100000011');
    const claimed = await claimNextOrder(riderId);

    await applyTransition(claimed.id, 'OUT_FOR_DELIVERY', { riderId, claimId: claimed.claim_id });
    const first = await applyTransition(claimed.id, 'DELIVERED', { riderId, claimId: claimed.claim_id });
    expect(first.status).toBe('DELIVERED');
    expect(first.alreadyApplied).toBeUndefined();

    const retry = await applyTransition(claimed.id, 'DELIVERED', { riderId, claimId: claimed.claim_id });
    expect(retry.status).toBe('DELIVERED');
    expect(retry.alreadyApplied).toBe(true);

    const { rows } = await pool.query('SELECT count(*) FROM deliveries WHERE order_id = $1', [claimed.id]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it('does not let a different rider confirm someone else\u2019s order', async () => {
    await seedReadyOrder();
    const riderId = await seedRider('+919100000012');
    const stranger = await seedRider('+919100000013');
    const claimed = await claimNextOrder(riderId);

    await applyTransition(claimed.id, 'OUT_FOR_DELIVERY', { riderId, claimId: claimed.claim_id });
    await applyTransition(claimed.id, 'DELIVERED', { riderId, claimId: claimed.claim_id });

    await expect(applyTransition(claimed.id, 'DELIVERED', { riderId: stranger })).rejects.toMatchObject({
      status: 409,
      code: 'STALE_CLAIM',
    });
  });
});

describe('lease measures rider liveness, not elapsed time', () => {
  it('a rider waiting on a slow kitchen keeps the order as long as the phone reports', async () => {
    await seedReadyOrder();
    const riderA = await seedRider('+919100000020');
    const riderB = await seedRider('+919100000021');

    const claimed = await claimNextOrder(riderA);

    await pool.query("UPDATE deliveries SET expires_at = now() + interval '1 minute' WHERE id = $1", [
      claimed.claim_id,
    ]);
    await recordLocations(riderA, [{ lat: 28.62, lng: 77.37, recordedAt: new Date().toISOString() }]);

    const stolen = await claimNextOrder(riderB);
    expect(stolen).toBeNull();

    const state = await getRiderState(riderA);
    expect(state.currentOrder.id).toBe(claimed.id);
    expect(state.currentOrder.status).toBe('PREPARING');
  });

  it('a heartbeat (no location fix) renews the lease just like a ping does', async () => {
    await seedReadyOrder();
    const riderA = await seedRider('+919100000024');
    const riderB = await seedRider('+919100000025');

    const claimed = await claimNextOrder(riderA);
    await pool.query("UPDATE deliveries SET expires_at = now() + interval '1 minute' WHERE id = $1", [
      claimed.claim_id,
    ]);

    const result = await sendHeartbeat(riderA);
    expect(result.leaseRenewedUntil).not.toBeNull();

    const stolen = await claimNextOrder(riderB);
    expect(stolen).toBeNull();

    const { rows } = await pool.query('SELECT count(*) FROM rider_locations WHERE rider_id = $1', [riderA]);
    expect(Number(rows[0].count)).toBe(0);
  });

  it('the same order IS reclaimed once the phone stops reporting', async () => {
    await seedReadyOrder();
    const riderA = await seedRider('+919100000022');
    const riderB = await seedRider('+919100000023');

    const claimed = await claimNextOrder(riderA);
    await pool.query("UPDATE deliveries SET expires_at = now() - interval '1 second' WHERE id = $1", [
      claimed.claim_id,
    ]);

    const reclaimed = await claimNextOrder(riderB);
    expect(reclaimed.id).toBe(claimed.id);
  });
});
