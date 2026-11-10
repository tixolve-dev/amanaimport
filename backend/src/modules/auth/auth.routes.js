// backend/src/modules/auth/auth.routes.js
'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('./auth.controller');
const { validate } = require('../../shared/middleware/validate');
const { authenticate } = require('../../shared/middleware/authenticate');
const validators = require('./auth.validator');

const router = express.Router();

// Tight limiter for brute-force-prone endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many attempts. Try again later.',
    },
  },
});

router.post('/register', authLimiter, validators.registerRules, validate, ctrl.register);
router.post('/login', authLimiter, validators.loginRules, validate, ctrl.login);
router.post('/refresh', authLimiter, validators.refreshRules, validate, ctrl.refresh);
router.post('/forgot-password', authLimiter, validators.forgotPasswordRules, validate, ctrl.forgotPassword);
router.post('/reset-password', authLimiter, validators.resetPasswordRules, validate, ctrl.resetPassword);

// Requires access token
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);

module.exports = router;