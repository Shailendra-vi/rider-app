import { Router } from 'express';
import { applyTransition } from './applyTransition.js';
import { getOrder } from './getOrder.js';
import { optionalRider } from '../lib/riderAuth.js';

export const orderRoutes = Router();

orderRoutes.get('/orders/:id', async (req, res, next) => {
  try {
    res.json(await getOrder(req.params.id));
  } catch (err) {
    next(err);
  }
});

orderRoutes.post('/orders/:id/transitions', optionalRider, async (req, res, next) => {
  try {
    const { to, claimId } = req.body ?? {};
    if (!to) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '"to" is required' } });
    }
    const order = await applyTransition(req.params.id, to, { riderId: req.riderId, claimId });
    res.json(order);
  } catch (err) {
    next(err);
  }
});
