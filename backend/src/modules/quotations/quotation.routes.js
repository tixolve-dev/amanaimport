// backend/src/modules/quotations/quotation.routes.js
'use strict';

const express = require('express');
const ctrl = require('./quotation.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');
const v = require('./quotation.validator');
const { param } = require('express-validator');

const router = express.Router();
router.use(authenticate);

// ----- Importer endpoints -----
router.post(
  '/requests/:requestId/quotes',
  authorize(ROLES.IMPORTER),
  [param('requestId').isMongoId(), ...v.createRules], validate,
  ctrl.submit,
);
router.get(
  '/my-quotes',
  authorize(ROLES.IMPORTER),
  v.listMineRules, validate, ctrl.listMine,
);
router.patch(
  '/:id',
  authorize(ROLES.IMPORTER),
  v.updateRules, validate, ctrl.update,
);
router.post(
  '/:id/withdraw',
  authorize(ROLES.IMPORTER),
  v.withdrawRules, validate, ctrl.withdraw,
);

// ----- Buyer endpoints -----
router.get(
  '/requests/:requestId/quotes',
  authorize(ROLES.BUYER),
  v.listForRequestRules, validate, ctrl.listForRequest,
);
router.post(
  '/:id/accept',
  authorize(ROLES.BUYER),
  v.acceptRules, validate, ctrl.accept,
);

module.exports = router;