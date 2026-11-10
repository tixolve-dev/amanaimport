// backend/src/modules/messaging/messaging.routes.js
'use strict';

const express = require('express');
const { param, body, query } = require('express-validator');
const ctrl = require('./messaging.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');

const router = express.Router();

// All messaging requires auth; only buyers and importers participate
router.use(authenticate, authorize(ROLES.BUYER, ROLES.IMPORTER));

const idRule = [param('id').isMongoId()];

// List my conversations (buyer sees their order threads, importer sees theirs)
router.get('/', ctrl.listMine);

// Single conversation metadata
router.get('/:id', idRule, validate, ctrl.get);

// Paginated messages inside a conversation
router.get(
  '/:id/messages',
  [
    param('id').isMongoId(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  ctrl.listMessages,
);

// Send a message
router.post(
  '/:id/messages',
  [
    param('id').isMongoId(),
    body('body').isString().trim().isLength({ min: 1, max: 2000 }),
  ],
  validate,
  ctrl.send,
);

module.exports = router;