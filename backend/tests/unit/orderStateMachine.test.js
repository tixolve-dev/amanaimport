
'use strict';

const {
  transition,
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  canTransition,
} = require('../../src/modules/orders/orderStateMachine');

function makeOrder(status) {
  return {
    status,
    statusHistory: [],
    completedAt: null,
    cancelledAt: null,
  };
}

describe('Order state machine', () => {
  test('allows a valid transition', () => {
    const order = makeOrder(ORDER_STATUS.AWAITING_PAYMENT);

    const result = transition(order, ORDER_STATUS.PAYMENT_SATISFIED, {
      actorId: 'user-123',
      actorRole: 'admin',
      note: 'Payment verified',
    });

    expect(result).toBe(order);
    expect(order.status).toBe(ORDER_STATUS.PAYMENT_SATISFIED);
    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0]).toMatchObject({
      from: ORDER_STATUS.AWAITING_PAYMENT,
      to: ORDER_STATUS.PAYMENT_SATISFIED,
      actor: 'user-123',
      actorRole: 'admin',
      note: 'Payment verified',
    });
  });

  test('uses default history values when context is omitted', () => {
    const order = makeOrder(ORDER_STATUS.AWAITING_PAYMENT);

    transition(order, ORDER_STATUS.CANCELLED);

    expect(order.statusHistory[0]).toMatchObject({
      actor: null,
      actorRole: 'system',
      note: '',
    });
  });

  test('rejects an unknown status', () => {
    const order = makeOrder(ORDER_STATUS.AWAITING_PAYMENT);

    expect(() => transition(order, 'not_a_real_status'))
      .toThrow('Unknown order status: not_a_real_status');

    expect(order.status).toBe(ORDER_STATUS.AWAITING_PAYMENT);
    expect(order.statusHistory).toHaveLength(0);
  });

  test('rejects a transition to the current status', () => {
    const order = makeOrder(ORDER_STATUS.PROCESSING);

    expect(() => transition(order, ORDER_STATUS.PROCESSING))
      .toThrow(`Order is already in "${ORDER_STATUS.PROCESSING}" state`);
  });

  test('rejects an invalid transition without changing the order', () => {
    const order = makeOrder(ORDER_STATUS.AWAITING_PAYMENT);

    expect(() => transition(order, ORDER_STATUS.COMPLETED))
      .toThrow(/Invalid transition/);

    expect(order.status).toBe(ORDER_STATUS.AWAITING_PAYMENT);
    expect(order.statusHistory).toHaveLength(0);
  });

  test('sets completedAt when the order is completed', () => {
    const order = makeOrder(ORDER_STATUS.DELIVERED);

    transition(order, ORDER_STATUS.COMPLETED);

    expect(order.status).toBe(ORDER_STATUS.COMPLETED);
    expect(order.completedAt).toBeInstanceOf(Date);
  });

  test('sets cancelledAt when the order is cancelled', () => {
    const order = makeOrder(ORDER_STATUS.AWAITING_PAYMENT);

    transition(order, ORDER_STATUS.CANCELLED);

    expect(order.status).toBe(ORDER_STATUS.CANCELLED);
    expect(order.cancelledAt).toBeInstanceOf(Date);
  });

  test('checks allowed and disallowed transitions', () => {
    expect(
      canTransition(
        ORDER_STATUS.AWAITING_PAYMENT,
        ORDER_STATUS.PAYMENT_SATISFIED,
      ),
    ).toBe(true);

    expect(
      canTransition(
        ORDER_STATUS.AWAITING_PAYMENT,
        ORDER_STATUS.COMPLETED,
      ),
    ).toBe(false);
  });

  test('completed and refunded orders have no outgoing transitions', () => {
    expect(ORDER_TRANSITIONS[ORDER_STATUS.COMPLETED]).toEqual([]);
    expect(ORDER_TRANSITIONS[ORDER_STATUS.REFUNDED]).toEqual([]);
  });
});
