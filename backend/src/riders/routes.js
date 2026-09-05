import { Router } from 'express';
import { claimNextOrder } from './claimNextOrder.js';

export const riderRoutes = Router();

riderRoutes.post('/riders/:riderId/claim', async (req, res, next) => {
  try {
    const order = await claimNextOrder(req.params.riderId);
    if (!order) return res.status(204).end();
    res.json(order);
  } catch (err) {
    next(err);
  }
});
