// backend/src/modules/orders/orderStateMachine.js
'use strict';

const { ORDER_STATUS, canTransition, ORDER_TRANSITIONS } = require('./order.statuses');
const ApiError = require('../../shared/utils/ApiError');

/**
 * Apply a state transition to an Order. Mutates and returns the document.
 * Caller must .save() the order afterwards (or pass a session-aware caller).
 *
 * @param {import('mongoose').Document} order
 * @param {string} to
 * @param {{ actorId?: string, actorRole?: string, note?: string }} [ctx]
 */
function transition(order, to, ctx = {}) {
  if (!Object.values(ORDER_STATUS).includes(to)) {
    throw ApiError.badRequest(`Unknown order status: ${to}`);
  }
  const from = order.status;
  if (from === to) {
    throw ApiError.conflict(`Order is already in "${to}" state`);
  }
  if (!canTransition(from, to)) {
    throw ApiError.conflict(
      `Invalid transition: "${from}" → "${to}"`,
      { code: 'INVALID_STATE_TRANSITION', details: { from, to } },
    );
  }
  order.statusHistory.push({
    from,
    to,
    actor: ctx.actorId || null,
    actorRole: ctx.actorRole || 'system',
    note: ctx.note || '',
  });
  order.status = to;
  if (to === ORDER_STATUS.COMPLETED) order.completedAt = new Date();
  if (to === ORDER_STATUS.CANCELLED) order.cancelledAt = new Date();
  return order;
}

module.exports = { transition, ORDER_STATUS, ORDER_TRANSITIONS, canTransition };