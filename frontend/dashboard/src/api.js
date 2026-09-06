const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request(path, { method = 'GET', body, riderId } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(riderId ? { 'X-Rider-Id': riderId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = payload?.error ?? {};
    const error = new Error(err.message ?? `HTTP ${res.status}`);
    error.code = err.code;
    error.details = err.details;
    throw error;
  }
  return payload;
}



export const api = {
  plans: () => request('/plans'),
  createPlan: (body) => request('/plans', { method: 'POST', body }),

  customers: () => request('/customers'),
  createCustomer: (body) => request('/customers', { method: 'POST', body }),

  riders: () => request('/ops/riders'),
  createRider: (body) => request('/riders', { method: 'POST', body }),

  subscriptions: () => request('/subscriptions'),
  createSubscription: (body) => request('/subscriptions', { method: 'POST', body }),
  addSubscriptionEvent: (id, kind, payload) => request(`/subscriptions/${id}/events`, { method: 'POST', body: { kind, payload } }),
  cancelSubscriptionEvent: (id, kind, entryId) => request(`/subscriptions/${id}/events/cancel`, { method: 'POST', body: { kind, entryId } }),

  orders: (serviceDate) => request(`/orders?serviceDate=${serviceDate}`),
  generate: (serviceDate) => request('/ops/generation', { method: 'POST', body: { serviceDate } }),
  transition: (orderId, to) => request(`/orders/${orderId}/transitions`, { method: 'POST', body: { to } }),

  payments: () => request('/ops/payments'),
  simulateWebhook: (body) => request('/ops/payments/simulate', { method: 'POST', body }),
  reconciliation: (serviceDate) => request(`/ops/reconciliation?serviceDate=${serviceDate}`),
};
