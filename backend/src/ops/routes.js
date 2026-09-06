import { Router } from 'express';
import {
  listPlans,
  createPlan,
  listCustomers,
  createCustomer,
  createRider,
  listSubscriptions,
  createSubscription,
  addSubscriptionEvent,
  cancelSubscriptionEvent,
  listOrders,
  listRidersDetailed,
  getPaymentsOverview,
  simulatePaymentWebhook,
  getReconciliation,
} from './service.js';

export const opsRoutes = Router();

const handle = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

opsRoutes.get('/plans', handle(() => listPlans()));
opsRoutes.post('/plans', handle((req) => createPlan(req.body)));

opsRoutes.get('/customers', handle(() => listCustomers()));
opsRoutes.post('/customers', handle((req) => createCustomer(req.body)));

opsRoutes.post('/riders', handle((req) => createRider(req.body)));
opsRoutes.get('/ops/riders', handle(() => listRidersDetailed()));

opsRoutes.get('/subscriptions', handle(() => listSubscriptions()));
opsRoutes.post('/subscriptions', handle((req) => createSubscription(req.body)));
opsRoutes.post('/subscriptions/:id/events', handle((req) => addSubscriptionEvent(req.params.id, req.body.kind, req.body.payload ?? {})));
opsRoutes.post('/subscriptions/:id/events/cancel', handle((req) => cancelSubscriptionEvent(req.params.id, req.body.kind, req.body.entryId)));

opsRoutes.get('/orders', handle((req) => listOrders({ serviceDate: req.query.serviceDate, status: req.query.status })));

opsRoutes.get('/ops/payments', handle(() => getPaymentsOverview()));
opsRoutes.post('/ops/payments/simulate', handle((req) => simulatePaymentWebhook(req.body)));
opsRoutes.get('/ops/reconciliation', handle((req) => getReconciliation(req.query.serviceDate)));
