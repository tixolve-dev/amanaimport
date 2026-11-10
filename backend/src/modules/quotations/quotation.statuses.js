// backend/src/modules/quotations/quotation.statuses.js
'use strict';

const QUOTATION_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  UPDATED: 'updated',
  WITHDRAWN: 'withdrawn',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',      // auto-rejected when another is accepted
  EXPIRED: 'expired',        // validity passed before buyer acted
});

// Importer may only edit/withdraw in these states
const IMPORTER_EDITABLE = [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED];
// Buyer may only accept from these
const BUYER_ACCEPTABLE = [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED];

module.exports = { QUOTATION_STATUS, IMPORTER_EDITABLE, BUYER_ACCEPTABLE };