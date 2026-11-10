// backend/src/modules/payments/payment.routes.js
'use strict';

const express = require('express');
const ctrl = require('./payment.controller');
const v = require('./payment.validator');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');

const router = express.Router();
router.use(authenticate);

// Buyer-only
router.get('/orders/:orderId/instructions', authorize(ROLES.BUYER), v.orderIdRule, validate, ctrl.instructions);
router.post('/orders/:orderId/submit', authorize(ROLES.BUYER), v.submitRules, validate, ctrl.submit);
router.get('/orders/:orderId/mine', authorize(ROLES.BUYER), v.orderIdRule, validate, ctrl.listMine);

module.exports = router;