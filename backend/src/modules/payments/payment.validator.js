// backend/src/modules/payments/payment.validator.js
'use strict';

const { body, param, query } = require('express-validator');

const submitRules = [
  param('orderId').isMongoId(),
  body('transactionReference').isString().trim().isLength({ min: 4, max: 120 }),
  body('amountETB').isFloat({ min: 0 }).toFloat(),
  body('paymentChannel').isIn(['bank_transfer', 'telebirr', 'cbe_birr', 'awash_birr', 'other']),
  body('paidAt').isISO8601(),
  body('receiptKey').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('receiptUrl').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('receiptMimeType').optional({ nullable: true }).isString().trim(),
  // Where the receipt file lives. Old clients omit these and default to 'storage'.
  body('receiptProvider').optional({ nullable: true }).isIn(['storage', 'cloudinary']),
  body('receiptDeliveryType').optional({ nullable: true }).isIn(['upload', 'authenticated']),
];

const verifyRules = [
  param('id').isMongoId(),
  body('action').isIn(['verify', 'reject', 'reverse', 'dispute']),
  body('note').optional().isString().trim().isLength({ max: 1000 }),
  body('rejectionReason').optional().isString().trim().isLength({ max: 1000 }),
];

const idRule = [param('id').isMongoId()];
const orderIdRule = [param('orderId').isMongoId()];

const listRules = [
  query('status').optional().isIn(['submitted', 'verified', 'rejected', 'reversed', 'disputed']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { submitRules, verifyRules, idRule, orderIdRule, listRules };