// backend/src/modules/orders/order.validator.js
'use strict';

const { body, param, query } = require('express-validator');

const idRule = [param('id').isMongoId()];

const listRules = [
  query('status').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const transitionRules = [
  param('id').isMongoId(),
  body('action').isString().isIn([
    'buyer_cancel', 'buyer_confirm_receipt',
    'importer_start_processing', 'importer_mark_shipped', 'importer_mark_customs',
    'importer_mark_in_transit', 'importer_mark_ready', 'importer_mark_delivered',
    'importer_cancel',
  ]),
  body('note').optional().isString().trim().isLength({ max: 500 }),
];

const adminTransitionRules = [
  param('id').isMongoId(),
  body('to').isString().notEmpty(),
  body('note').optional().isString().trim().isLength({ max: 500 }),
];

module.exports = { idRule, listRules, transitionRules, adminTransitionRules };