// backend/src/modules/notifications/notification.routes.js
'use strict';

const express = require('express');
const ctrl = require('./notification.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { param } = require('express-validator');
const { validate } = require('../../shared/middleware/validate');

const router = express.Router();
router.use(authenticate);

router.get('/', ctrl.listMine);
router.post('/read-all', ctrl.markAllRead);
router.patch('/:id/read', [param('id').isMongoId()], validate, ctrl.markRead);

module.exports = router;