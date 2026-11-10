// backend/src/modules/categories/category.routes.js
'use strict';

const express = require('express');
const ctrl = require('./category.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');
const v = require('./category.validator');

const router = express.Router();

// Public
router.get('/', ctrl.list);
router.get('/:id', v.idRule, validate, ctrl.get);

// Admin only
router.post('/', authenticate, authorize(ROLES.ADMIN), v.createRules, validate, ctrl.create);
router.patch('/:id', authenticate, authorize(ROLES.ADMIN), v.updateRules, validate, ctrl.update);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), v.idRule, validate, ctrl.remove);

module.exports = router;