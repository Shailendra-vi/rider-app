import { Router } from 'express';
import { applyTransition } from './applyTransition.js';

export const orderRoutes = Router();

orderRoutes.post('/orders/:id/transitions', async (req, res, next) => {
  try {
    const { to } = req.body ?? {};
    if (!to) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '"to" is required' } });
    }
    const order = await applyTransition(req.params.id, to);
    res.json(order);
  } catch (err) {
    next(err);
  }
});
