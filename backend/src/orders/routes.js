import { Router } from 'express';
import { applyTransition } from './applyTransition.js';
import { getOrder } from './getOrder.js';
import { requireRiderOrOps } from '../lib/opsAuth.js';
import { requireActiveRider } from '../lib/riderAuth.js';

export const orderRoutes = Router();

orderRoutes.get('/orders/:id', requireRiderOrOps, async (req, res, next) => {
  try {
    const order = await getOrder(req.params.id);
    if (!req.isOps && order.rider_id !== req.riderId)
      return res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

orderRoutes.post(
  '/orders/:id/transitions',
  requireRiderOrOps,
  (req, res, next) => (req.isOps ? next() : requireActiveRider(req, res, next)),
  async (req, res, next) => {
    try {
      const { to, claimId } = req.body ?? {};
      if (!to) {
        return res
          .status(400)
          .json({ error: { code: 'VALIDATION_FAILED', message: '"to" is required' } });
      }
      const order = await applyTransition(req.params.id, to, {
        riderId: req.riderId,
        claimId,
      });
      res.json(order);
    } catch (err) {
      next(err);
    }
  },
);
