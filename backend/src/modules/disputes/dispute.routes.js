// backend/src/modules/disputes/dispute.routes.js
'use strict';

const express = require('express');
const ctrl = require('./dispute.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { param, body, query } = require('express-validator');
const { validate } = require('../../shared/middleware/validate');

const router = express.Router();
router.use(authenticate);

router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
], validate, ctrl.listMine);

router.get('/orders/:orderId', [param('orderId').isMongoId()], validate, ctrl.listForOrder);

router.post('/orders/:orderId', [
  param('orderId').isMongoId(),
  body('reason').isIn([
    'non_delivery', 'damaged_goods', 'incorrect_product', 'spec_mismatch',
    'excessive_delay', 'unapproved_charges', 'cancellation',
    'payment_evidence', 'other',
  ]),
  body('description').isString().trim().isLength({ min: 10, max: 3000 }),
  body('evidence').optional().isArray({ max: 10 }),
], validate, ctrl.open);

router.post('/:id/messages', [
  param('id').isMongoId(),
  body('body').isString().trim().isLength({ min: 1, max: 3000 }),
], validate, ctrl.addMessage);

router.post('/:id/withdraw', [param('id').isMongoId()], validate, ctrl.withdraw);

module.exports = router;