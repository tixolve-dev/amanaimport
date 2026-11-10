// backend/src/modules/shipments/shipment.routes.js
'use strict';

const express = require('express');
const ctrl = require('./shipment.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { param, body } = require('express-validator');
const { validate } = require('../../shared/middleware/validate');

const router = express.Router();
router.use(authenticate);

const idRule = [param('orderId').isMongoId()];

const eventRules = [
  param('orderId').isMongoId(),
  body('stage').isIn([
    'picked_up', 'departed_origin', 'in_transit', 'customs',
    'arrived_destination', 'out_for_delivery', 'delivered', 'exception',
  ]),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('location').optional().isString().trim().isLength({ max: 200 }),
  body('occurredAt').isISO8601(),
  body('evidenceKey').optional().isString().trim(),
  body('evidenceUrl').optional().isString().trim(),
  body('trackingNumber').optional().isString().trim().isLength({ max: 200 }),
  body('carrier').optional().isString().trim().isLength({ max: 200 }),
];

router.get('/orders/:orderId', idRule, validate, ctrl.get);
router.post('/orders/:orderId/events', eventRules, validate, ctrl.addEvent);

module.exports = router;