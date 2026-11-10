// backend/src/modules/quotations/quotation.validator.js
'use strict';

const { body, param, query } = require('express-validator');

const itemizedRules = [
  body('itemizedCosts').optional().isArray({ max: 20 }),
  body('itemizedCosts.*.label').isString().trim().isLength({ min: 1, max: 120 }),
  body('itemizedCosts.*.amountETB').isFloat({ min: 0 }).toFloat(),
  body('itemizedCosts.*.note').optional().isString().trim().isLength({ max: 300 }),
];

const createRules = [
  body('totalPriceETB').isFloat({ min: 0 }).toFloat(),
  ...itemizedRules,
  body('isEstimateFinal').optional().isBoolean().toBoolean(),
  body('exclusions').optional().isString().trim().isLength({ max: 1000 }),
  body('productCondition').isIn([
    'new', 'used_like_new', 'used_good', 'used_fair', 'refurbished',
  ]),
  body('specifications').optional().isString().trim().isLength({ max: 3000 }),
  body('warrantyOffered').optional().isString().trim().isLength({ max: 500 }),
  body('returnPolicy').optional().isString().trim().isLength({ max: 1000 }),
  body('estimatedDeliveryDays').isInt({ min: 1, max: 365 }).toInt(),
  body('quotationValidUntil').isISO8601(),
  body('notes').optional().isString().trim().isLength({ max: 2000 }),
  body('attachments').optional().isArray({ max: 10 }),
  body('attachments.*.key').isString().notEmpty(),
  body('attachments.*.url').isString().notEmpty(),
  body('attachments.*.mimeType').isString().notEmpty(),
  body('attachments.*.size').isInt({ min: 1 }).toInt(),
];

const updateRules = [
  param('id').isMongoId(),
  body('totalPriceETB').optional().isFloat({ min: 0 }).toFloat(),
  ...itemizedRules,
  body('isEstimateFinal').optional().isBoolean().toBoolean(),
  body('exclusions').optional().isString().trim().isLength({ max: 1000 }),
  body('productCondition').optional().isIn([
    'new', 'used_like_new', 'used_good', 'used_fair', 'refurbished',
  ]),
  body('specifications').optional().isString().trim().isLength({ max: 3000 }),
  body('warrantyOffered').optional().isString().trim().isLength({ max: 500 }),
  body('returnPolicy').optional().isString().trim().isLength({ max: 1000 }),
  body('estimatedDeliveryDays').optional().isInt({ min: 1, max: 365 }).toInt(),
  body('quotationValidUntil').optional().isISO8601(),
  body('notes').optional().isString().trim().isLength({ max: 2000 }),
  body('attachments').optional().isArray({ max: 10 }),
];

const idRule = [param('id').isMongoId()];

const withdrawRules = [
  param('id').isMongoId(),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
];

const listForRequestRules = [
  param('requestId').isMongoId(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const listMineRules = [
  query('status').optional().isIn([
    'submitted', 'updated', 'withdrawn', 'accepted', 'rejected', 'expired',
  ]),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const acceptRules = [param('id').isMongoId()];

module.exports = {
  createRules,
  updateRules,
  withdrawRules,
  listForRequestRules,
  listMineRules,
  acceptRules,
  idRule,
};