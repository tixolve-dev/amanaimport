// backend/src/modules/auth/auth.validator.js
'use strict';

const { body } = require('express-validator');
const { ROLES } = require('../../shared/constants/roles');
const { BUYER_TYPE } = require('../../shared/constants/statuses');
const { ETHIOPIAN_PHONE_REGEX } = require('../users/user.model');

const SELF_REGISTER_ROLES = [ROLES.BUYER, ROLES.IMPORTER];

const passwordRule = body('password')
  .isString()
  .withMessage('Password must be a string')
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be 8–128 characters')
  .matches(/[A-Za-z]/)
  .withMessage('Password must contain a letter')
  .matches(/\d/)
  .withMessage('Password must contain a digit');

const registerRules = [
  body('fullName')
    .isString()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Full name must be 2–120 characters'),
  body('email')
    .isString()
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('phone')
    .isString()
    .trim()
    .custom((v) => ETHIOPIAN_PHONE_REGEX.test(v))
    .withMessage('Phone must be a valid Ethiopian number'),
  passwordRule,
  body('role')
    .isIn(SELF_REGISTER_ROLES)
    .withMessage(`Role must be one of: ${SELF_REGISTER_ROLES.join(', ')}`),
  body('buyerType')
    .optional({ nullable: true })
    .isIn(Object.values(BUYER_TYPE))
    .withMessage(`buyerType must be one of: ${Object.values(BUYER_TYPE).join(', ')}`),
  body('preferredLanguage')
    .optional()
    .isIn(['en', 'am'])
    .withMessage('preferredLanguage must be en or am'),
];

const loginRules = [
  body('identifier').isString().trim().notEmpty().withMessage('Email or phone is required'),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

const refreshRules = [
  body('refreshToken').isString().notEmpty().withMessage('refreshToken is required'),
];

const forgotPasswordRules = [
  body('email').isString().trim().toLowerCase().isEmail().withMessage('Valid email is required'),
];

const resetPasswordRules = [
  body('token').isString().notEmpty().withMessage('token is required'),
  passwordRule,
];

module.exports = {
  registerRules,
  loginRules,
  refreshRules,
  forgotPasswordRules,
  resetPasswordRules,
  SELF_REGISTER_ROLES,
};