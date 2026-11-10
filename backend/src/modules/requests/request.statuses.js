// backend/src/modules/requests/request.statuses.js
'use strict';

const REQUEST_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  RECEIVING_OFFERS: 'receiving_offers',
  OFFER_SELECTED: 'offer_selected',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REJECTED_BY_ADMIN: 'rejected_by_admin',
});

// Transitions allowed on the backend. Nothing else is legal.
const ALLOWED_TRANSITIONS = Object.freeze({
  [REQUEST_STATUS.DRAFT]: [
    REQUEST_STATUS.PUBLISHED,
    REQUEST_STATUS.CANCELLED,
  ],
  [REQUEST_STATUS.PUBLISHED]: [
    REQUEST_STATUS.RECEIVING_OFFERS,
    REQUEST_STATUS.CANCELLED,
    REQUEST_STATUS.EXPIRED,
  ],
  [REQUEST_STATUS.RECEIVING_OFFERS]: [
    REQUEST_STATUS.OFFER_SELECTED,
    REQUEST_STATUS.CANCELLED,
    REQUEST_STATUS.EXPIRED,
    REQUEST_STATUS.REJECTED_BY_ADMIN,
  ],
  [REQUEST_STATUS.OFFER_SELECTED]: [
    REQUEST_STATUS.FULFILLED,
    REQUEST_STATUS.CANCELLED, // only via dispute/refund workflow later
  ],
  [REQUEST_STATUS.FULFILLED]: [],
  [REQUEST_STATUS.CANCELLED]: [],
  [REQUEST_STATUS.EXPIRED]: [],
  [REQUEST_STATUS.REJECTED_BY_ADMIN]: [],
});

function canTransition(from, to) {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

module.exports = { REQUEST_STATUS, ALLOWED_TRANSITIONS, canTransition };