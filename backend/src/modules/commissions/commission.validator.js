// backend/src/modules/commissions/commission.validator.js
'use strict';

const { body, param, query } = require('express-validator');
const { FEE_TYPE, PAYER, REVENUE_STATE } = require('./commissionRule.model');
const { REVENUE_STATE: _RS } = require('./commissionRecord.model');

const createRules = [
  body('name').isString().trim().isLength({ min: 2, max: 120 }),
  body('version').isString().trim().isLength({ min: 1, max: 60 }),
  body('feeType').isIn(Object.values(FEE_TYPE)),
  body('percentage').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).toFloat(),
  body('fixedAmountETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('minFeeETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('maxFeeETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('payer').isIn(Object.values(PAYER)),
  body('categoryIds').optional().isArray({ max: 50 }),
  body('categoryIds.*').optional().isMongoId(),
  body('effectiveFrom').isISO8601(),
  body('effectiveUntil').optional({ nullable: true }).isISO8601(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('description').optional().isString().trim().isLength({ max: 500 }),
];

const updateRules = [
  param('id').isMongoId(),
  body('effectiveUntil').optional({ nullable: true }).isISO8601(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('description').optional().isString().trim().isLength({ max: 500 }),
];

const idRule = [param('id').isMongoId()];

const listRules = [
  query('isActive').optional().isIn(['true', 'false']),
  query('category').optional().isMongoId(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const listRecords = [
  query('revenueState').optional().isIn(Object.values(_RS)),
  query('payer').optional().isIn(Object.values(PAYER)),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const transitionRules = [
  param('id').isMongoId(),
  body('to').isIn(Object.values(_RS)),
  body('note').optional().isString().trim().isLength({ max: 1000 }),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
];

module.exports = { createRules, updateRules, idRule, listRules, listRecords, transitionRules };