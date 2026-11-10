// backend/src/modules/reviews/review.routes.js
'use strict';

const express = require('express');
const ctrl = require('./review.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { ROLES } = require('../../shared/constants/roles');
const { param, body } = require('express-validator');
const { validate } = require('../../shared/middleware/validate');

const router = express.Router();

// Public: list reviews for an importer profile
router.get('/importers/:importerId', [param('importerId').isMongoId()], validate, ctrl.listForImporter);

// Buyer: submit review for a completed order
router.post(
  '/orders/:orderId',
  authenticate, authorize(ROLES.BUYER),
  [
    param('orderId').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }).toInt(),
    body('comment').optional().isString().trim().isLength({ max: 1000 }),
    body('communicationRating').optional().isInt({ min: 1, max: 5 }).toInt(),
    body('deliveryRating').optional().isInt({ min: 1, max: 5 }).toInt(),
    body('qualityRating').optional().isInt({ min: 1, max: 5 }).toInt(),
  ],
  validate, ctrl.submit,
);

module.exports = router;