// backend/src/modules/commissions/commission.routes.js
'use strict';

const express = require('express');
const { query } = require('express-validator');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');
const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./commission.service');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/v1/commissions/preview?categoryId=<id>&orderValueETB=<number>
 * Preview the platform fee the buyer will see BEFORE accepting a quotation.
 * Server-side authority — client values are never trusted for calculation.
 * Available to buyers (they see the fee) and importers (transparency).
 */
router.get(
  '/preview',
  authorize(ROLES.BUYER, ROLES.IMPORTER),
  [
    query('categoryId').isMongoId().withMessage('categoryId is required'),
    query('orderValueETB').isFloat({ min: 0 }).withMessage('orderValueETB must be >= 0').toFloat(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const preview = await service.computeFeePreview(
        req.query.categoryId,
        req.query.orderValueETB,
      );
      return res.status(200).json(ApiResponse.ok(preview, 'Fee preview'));
    } catch (err) { return next(err); }
  },
);

module.exports = router;