// backend/src/modules/requests/request.routes.js
'use strict';

const express = require('express');
const ctrl = require('./request.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');
const v = require('./request.validator');

const router = express.Router();

// All request routes require authentication
router.use(authenticate);

// ---- Importer discovery (must come before '/:id' to avoid collision) ----
router.get(
  '/browse',
  authorize(ROLES.IMPORTER),
  v.discoverRules, validate, ctrl.discover,
);
router.get(
  '/browse/:id',
  authorize(ROLES.IMPORTER),
  v.idRule, validate, ctrl.discoverDetail,
);

// ---- Buyer ----
router.post(
  '/',
  authorize(ROLES.BUYER),
  v.createRules, validate, ctrl.create,
);
router.get(
  '/me',
  authorize(ROLES.BUYER),
  v.listMineRules, validate, ctrl.listMine,
);
router.get(
  '/me/:id',
  authorize(ROLES.BUYER),
  v.idRule, validate, ctrl.getMine,
);
router.patch(
  '/me/:id',
  authorize(ROLES.BUYER),
  v.updateRules, validate, ctrl.update,
);
router.post(
  '/me/:id/publish',
  authorize(ROLES.BUYER),
  v.publishRules, validate, ctrl.publish,
);
router.post(
  '/me/:id/cancel',
  authorize(ROLES.BUYER),
  v.cancelRules, validate, ctrl.cancel,
);

module.exports = router;