// backend/src/modules/orders/order.statuses.js
'use strict';

const ORDER_STATUS = Object.freeze({
  AWAITING_PAYMENT: 'awaiting_payment_confirmation',
  PAYMENT_SATISFIED: 'payment_condition_satisfied',
  PROCESSING: 'processing',
  SHIPPING: 'import_shipment_in_progress',
  CUSTOMS: 'customs_clearance',
  IN_TRANSIT: 'in_transit',
  READY_FOR_DELIVERY: 'ready_for_delivery',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
});

// Forward transitions enforced by the order state machine
// (authorized by ORDER_STATE_MACHINE.md in Phase 1.5b)
const ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.AWAITING_PAYMENT]: [
    ORDER_STATUS.PAYMENT_SATISFIED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.DISPUTED,
  ],
  [ORDER_STATUS.PAYMENT_SATISFIED]: [
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.DISPUTED,
  ],
  [ORDER_STATUS.PROCESSING]: [
    ORDER_STATUS.SHIPPING,
    ORDER_STATUS.DISPUTED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.SHIPPING]: [
    ORDER_STATUS.CUSTOMS,
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DISPUTED,
  ],
  [ORDER_STATUS.CUSTOMS]: [
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DISPUTED,
  ],
  [ORDER_STATUS.IN_TRANSIT]: [
    ORDER_STATUS.READY_FOR_DELIVERY,
    ORDER_STATUS.DISPUTED,
  ],
  [ORDER_STATUS.READY_FOR_DELIVERY]: [
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.DISPUTED,
  ],
  [ORDER_STATUS.DELIVERED]: [
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.DISPUTED,
  ],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.DISPUTED]: [
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.REFUND_PENDING,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.REFUND_PENDING]: [ORDER_STATUS.REFUNDED],
  [ORDER_STATUS.REFUNDED]: [],
});

function canTransition(from, to) {
  return (ORDER_TRANSITIONS[from] || []).includes(to);
}

module.exports = { ORDER_STATUS, ORDER_TRANSITIONS, canTransition };