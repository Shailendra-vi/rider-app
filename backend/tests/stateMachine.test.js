import { describe, it, expect } from 'vitest';
import { allowedTransitions, isValidTransition } from '../src/orders/stateMachine.js';

describe('order state machine', () => {
  it('allows the happy path in order', () => {
    expect(isValidTransition('PLACED', 'CONFIRMED')).toBe(true);
    expect(isValidTransition('CONFIRMED', 'PREPARING')).toBe(true);
    expect(isValidTransition('PREPARING', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(isValidTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('allows cancellation only where food is not already on the road', () => {
    expect(isValidTransition('PLACED', 'CANCELLED')).toBe(true);
    expect(isValidTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(isValidTransition('PREPARING', 'CANCELLED')).toBe(true);
    expect(isValidTransition('OUT_FOR_DELIVERY', 'CANCELLED')).toBe(false);
  });

  it('allows FAILED only from OUT_FOR_DELIVERY', () => {
    expect(isValidTransition('OUT_FOR_DELIVERY', 'FAILED')).toBe(true);
    expect(isValidTransition('PREPARING', 'FAILED')).toBe(false);
  });

  it('rejects skipping states', () => {
    expect(isValidTransition('PLACED', 'DELIVERED')).toBe(false);
    expect(isValidTransition('PLACED', 'OUT_FOR_DELIVERY')).toBe(false);
  });

  it('treats DELIVERED, CANCELLED and FAILED as terminal', () => {
    expect(allowedTransitions('DELIVERED')).toEqual([]);
    expect(allowedTransitions('CANCELLED')).toEqual([]);
    expect(allowedTransitions('FAILED')).toEqual([]);
  });
});
