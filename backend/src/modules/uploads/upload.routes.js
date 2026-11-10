// backend/src/modules/uploads/upload.routes.js
'use strict';

const express = require('express');
const ctrl = require('./upload.controller');
const { authenticate } = require('../../shared/middleware/authenticate');

const router = express.Router();
router.use(authenticate);

router.post('/single', ctrl.single, ctrl.handleSingle);
router.post('/multiple', ctrl.multiple, ctrl.handleMultiple);
router.delete('/*key', ctrl.handleDelete);

module.exports = router;
