
'use strict';

const express = require('express');
const ctrl = require('./importer.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');
const v = require('./importer.validator');

const router = express.Router();

// Importer-facing
router.get(
  '/me',
  authenticate,
  authorize(ROLES.IMPORTER),
  ctrl.getMyProfile,
);

// Create or save the importer profile
router.post(
  '/me',
  authenticate,
  authorize(ROLES.IMPORTER),
  v.submitVerificationRules,
  validate,
  ctrl.saveMyProfile,
);

// Submit the profile for verification
router.post(
  '/me/verification',
  authenticate,
  authorize(ROLES.IMPORTER),
  v.submitVerificationRules,
  validate,
  ctrl.submitVerification,
);

// Verification documents
router.post(
  '/me/documents',
  authenticate,
  authorize(ROLES.IMPORTER),
  v.uploadDocumentRules,
  validate,
  ctrl.addDocument,
);

router.delete(
  '/me/documents/:documentId',
  authenticate,
  authorize(ROLES.IMPORTER),
  ctrl.removeDocument,
);

// Public importer summary
router.get('/:importerId/public', ctrl.getPublicSummary);

module.exports = router;
