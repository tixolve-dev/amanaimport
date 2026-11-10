// backend/src/shared/constants/statuses.js
'use strict';

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PENDING_VERIFICATION: 'pending_verification',
  DELETED: 'deleted',
});

const BUYER_TYPE = Object.freeze({
  INDIVIDUAL: 'individual',
  BUSINESS: 'business',
});

module.exports = { USER_STATUS, BUYER_TYPE };