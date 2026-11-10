'use strict';

const express = require('express');
const v1 = require('./v1');

const router = express.Router();

// API version prefix is already registered in app.js.
// Mount v1 routes directly to avoid duplicating /v1.
router.use('/', v1);

module.exports = router;