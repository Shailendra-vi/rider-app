const TRANSITIONS = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  CANCELLED: [],
  FAILED: [],
};

export function allowedTransitions(status) {
  return TRANSITIONS[status] ?? [];
}

export function isValidTransition(from, to) {
  return allowedTransitions(from).includes(to);
}
