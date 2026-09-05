import { Router } from 'express';
import { generateOrdersForDate } from './generateOrdersForDate.js';

export const generationRoutes = Router();

generationRoutes.post('/ops/generation', async (req, res, next) => {
  try {
    const { serviceDate, asOf } = req.body ?? {};
    if (!serviceDate) {
      return res.status(400).json({ error: { message: 'serviceDate is required' } });
    }
    const result = await generateOrdersForDate(serviceDate, {
      asOf: asOf ? new Date(asOf) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
