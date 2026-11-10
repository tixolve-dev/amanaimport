// backend/src/modules/admin/fraud.routes.js
'use strict';

const express = require('express');
const ctrl = require('./fraud.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/middleware/validate');

const router = express.Router();

// Optional auth — an anonymous user can also report fraud
router.post('/', [
  body('category').isIn([
    'suspected_fraud', 'fake_importer', 'counterfeit_product', 'payment_scam',
    'off_platform_deal', 'harassment', 'other',
  ]),
  body('description').isString().trim().isLength({ min: 10, max: 3000 }),
  body('relatedOrder').optional({ nullable: true }).isMongoId(),
  body('relatedUser').optional({ nullable: true }).isMongoId(),
  body('relatedRequest').optional({ nullable: true }).isMongoId(),
  body('evidence').optional().isArray({ max: 10 }),
], validate, ctrl.submit);

module.exports = router;