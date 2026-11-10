// backend/src/modules/users/user.routes.js
'use strict';

const express = require('express');
const { body, query } = require('express-validator');
const ctrl = require('./user.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { validate } = require('../../shared/middleware/validate');

const router = express.Router();

// Everything below requires a valid access token
router.use(authenticate);

// Get the current user's full profile (safe shape)
router.get('/me', ctrl.getMe);

// Update profile — whitelist only safe fields (name, language, etc.)
router.patch(
  '/me',
  [
    body('fullName').optional().isString().trim().isLength({ min: 2, max: 120 }),
    body('preferredLanguage').optional().isIn(['en', 'am']),
    body('buyerType').optional({ nullable: true }).isIn(['individual', 'business']),
  ],
  validate,
  ctrl.updateMe,
);

// Change password — requires current password, server-side only
router.post(
  '/me/change-password',
  [
    body('currentPassword').isString().notEmpty(),
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be 8–128 characters')
      .matches(/[A-Za-z]/)
      .withMessage('Password must contain a letter')
      .matches(/\d/)
      .withMessage('Password must contain a digit'),
  ],
  validate,
  ctrl.changePassword,
);

// Update FCM token (mobile push registration)
router.post(
  '/me/fcm-token',
  [body('token').isString().trim().isLength({ min: 10, max: 500 })],
  validate,
  ctrl.updateFcmToken,
);

// Soft-delete own account — requires password confirmation
router.post(
  '/me/delete',
  [body('password').isString().notEmpty()],
  validate,
  ctrl.deleteMe,
);

module.exports = router;