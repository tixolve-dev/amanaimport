// backend/src/modules/importers/importer.validator.js
'use strict';

const { body, param } = require('express-validator');
const { DOC_TYPES } = require('./verificationDocument.model');

const submitVerificationRules = [
  body('businessName').isString().trim().isLength({ min: 2, max: 150 }),
  body('businessType').optional().isIn(['individual', 'company', 'partnership']),
  body('tinNumber').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('businessLicenseNumber').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('licenseExpiryDate').optional({ nullable: true }).isISO8601(),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('yearEstablished').optional({ nullable: true }).isInt({ min: 1900, max: new Date().getFullYear() }).toInt(),
  body('contactEmail').optional({ nullable: true }).isEmail().normalizeEmail(),
  body('contactPhone').optional({ nullable: true }).isString().trim(),
  body('officeAddress').optional().isObject(),
  body('serviceAreas').optional().isArray({ max: 20 }),
  body('serviceAreas.*').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('supportedCategoryIds').optional().isArray({ max: 30 }),
  body('supportedCategoryIds.*').optional().isMongoId(),
];

const uploadDocumentRules = [
  body('type').isIn(Object.values(DOC_TYPES)),
  body('fileKey').isString().notEmpty(),
  body('fileUrl').isString().notEmpty(),
  body('mimeType').isString().notEmpty(),
  body('size').isInt({ min: 1 }).toInt(),
  body('label').optional().isString().trim().isLength({ max: 200 }),
];

const adminReviewRules = [
  param('importerId').isMongoId(),
  body('action').isIn(['approve', 'reject', 'suspend', 'reinstate', 'expire']),
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
];

const importerIdRule = [param('importerId').isMongoId()];

module.exports = {
  submitVerificationRules,
  uploadDocumentRules,
  adminReviewRules,
  importerIdRule,
};