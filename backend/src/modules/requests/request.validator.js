// backend/src/modules/requests/request.validator.js
'use strict';

const { body, param, query } = require('express-validator');
const { REQUEST_STATUS } = require('./request.statuses');

const createRules = [
  body('title').isString().trim().isLength({ min: 4, max: 200 }),
  body('description').isString().trim().isLength({ min: 10, max: 5000 }),
  body('category').isMongoId(),
  body('subcategory').optional({ nullable: true }).isMongoId(),
  body('brand').optional().isString().trim().isLength({ max: 100 }),
  body('model').optional().isString().trim().isLength({ max: 100 }),
  body('referenceUrl').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('specifications').optional().isString().trim().isLength({ max: 3000 }),
  body('quantity').isInt({ min: 1, max: 1000000 }).toInt(),
  body('unitOfMeasurement').optional().isString().trim().isLength({ max: 30 }),
  body('budgetMinETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('budgetMaxETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('deliveryCity').isString().trim().isLength({ min: 1, max: 100 }),
  body('deliveryAddress').optional().isString().trim().isLength({ max: 500 }),
  body('requiredDeliveryDate').optional({ nullable: true }).isISO8601(),
  body('warrantyRequired').optional().isBoolean().toBoolean(),
  body('warrantyDetails').optional().isString().trim().isLength({ max: 500 }),
  body('qualityRequirements').optional().isString().trim().isLength({ max: 2000 }),
  body('additionalInstructions').optional().isString().trim().isLength({ max: 2000 }),
  body('expiresAt').isISO8601(),
  body('attachments').optional().isArray({ max: 10 }),
  body('attachments.*.key').optional().isString().notEmpty(),
  body('attachments.*.url').optional().isString().notEmpty(),
  body('attachments.*.mimeType').optional().isString().notEmpty(),
  body('attachments.*.size').optional().isInt({ min: 1 }).toInt(),
  body('attachments.*.kind').optional().isIn(['reference_image', 'attachment']),
  body('attachments.*.originalName').optional().isString(),
  // Cross-field
  body('budgetMaxETB').custom((val, { req }) => {
    if (
      val != null && req.body.budgetMinETB != null
      && Number(val) < Number(req.body.budgetMinETB)
    ) {
      throw new Error('budgetMaxETB must be >= budgetMinETB');
    }
    return true;
  }),
];

const updateRules = [
  param('id').isMongoId(),
  body('title').optional().isString().trim().isLength({ min: 4, max: 200 }),
  body('description').optional().isString().trim().isLength({ min: 10, max: 5000 }),
  body('category').optional().isMongoId(),
  body('subcategory').optional({ nullable: true }).isMongoId(),
  body('brand').optional().isString().trim().isLength({ max: 100 }),
  body('model').optional().isString().trim().isLength({ max: 100 }),
  body('referenceUrl').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('specifications').optional().isString().trim().isLength({ max: 3000 }),
  body('quantity').optional().isInt({ min: 1, max: 1000000 }).toInt(),
  body('unitOfMeasurement').optional().isString().trim().isLength({ max: 30 }),
  body('budgetMinETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('budgetMaxETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('deliveryCity').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('deliveryAddress').optional().isString().trim().isLength({ max: 500 }),
  body('requiredDeliveryDate').optional({ nullable: true }).isISO8601(),
  body('warrantyRequired').optional().isBoolean().toBoolean(),
  body('warrantyDetails').optional().isString().trim().isLength({ max: 500 }),
  body('qualityRequirements').optional().isString().trim().isLength({ max: 2000 }),
  body('additionalInstructions').optional().isString().trim().isLength({ max: 2000 }),
  body('expiresAt').optional().isISO8601(),
  body('attachments').optional().isArray({ max: 10 }),
];

const publishRules = [param('id').isMongoId()];
const cancelRules = [
  param('id').isMongoId(),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
];

const idRule = [param('id').isMongoId()];

const listMineRules = [
  query('status').optional().isIn(Object.values(REQUEST_STATUS)),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const discoverRules = [
  query('category').optional().isMongoId(),
  query('city').optional().isString().trim().isLength({ min: 1, max: 100 }),
  query('budgetMin').optional().isFloat({ min: 0 }).toFloat(),
  query('budgetMax').optional().isFloat({ min: 0 }).toFloat(),
  query('q').optional().isString().trim().isLength({ max: 100 }),
  query('sort').optional().isIn(['newest', 'oldest', 'expiring_soon', 'highest_budget']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  createRules, updateRules, publishRules, cancelRules, idRule, listMineRules, discoverRules,
};