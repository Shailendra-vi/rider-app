import { Router } from 'express';
import { claimNextOrder } from './claimNextOrder.js';
import { listRiders, setShift, getRiderState, recordLocations, sendHeartbeat } from './service.js';
import { requireRider, requireActiveRider } from '../lib/riderAuth.js';
import { requireOps } from '../lib/opsAuth.js';

export const riderRoutes = Router();

riderRoutes.get('/riders', requireOps, async (req, res, next) => {
  try {
    res.json(await listRiders());
  } catch (err) {
    next(err);
  }
});

riderRoutes.get('/rider/me', requireRider, async (req, res, next) => {
  try {
    res.json(await getRiderState(req.riderId));
  } catch (err) {
    next(err);
  }
});

riderRoutes.post('/rider/shift', requireRider, requireActiveRider, async (req, res, next) => {
  try {
    const { online } = req.body ?? {};
    if (typeof online !== 'boolean') {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '"online" must be a boolean' } });
    }
    res.json(await setShift(req.riderId, online));
  } catch (err) {
    next(err);
  }
});

riderRoutes.post('/rider/claim', requireRider, requireActiveRider, async (req, res, next) => {
  try {
    if (!req.rider.is_online) {
      return res.status(409).json({ error: { code: 'RIDER_OFFLINE', message: 'Go online before claiming orders' } });
    }
    const order = await claimNextOrder(req.riderId);
    if (!order) return res.status(204).end();
    res.json(order);
  } catch (err) {
    next(err);
  }
});

riderRoutes.post('/rider/locations', requireRider, requireActiveRider, async (req, res, next) => {
  try {
    const { pings } = req.body ?? {};
    if (!Array.isArray(pings)) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '"pings" must be an array' } });
    }
    res.json(await recordLocations(req.riderId, pings));
  } catch (err) {
    next(err);
  }
});

riderRoutes.post('/rider/heartbeat', requireRider, requireActiveRider, async (req, res, next) => {
  try {
    res.json(await sendHeartbeat(req.riderId));
  } catch (err) {
    next(err);
  }
});
