// backend/src/modules/categories/category.validator.js
'use strict';

const { body, param } = require('express-validator');

const createRules = [
  body('name').isString().trim().isLength({ min: 2, max: 100 }),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('icon').optional({ nullable: true }).isString(),
  body('parentId').optional({ nullable: true }).isMongoId(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('isRestricted').optional().isBoolean().toBoolean(),
  body('sortOrder').optional().isInt({ min: 0 }).toInt(),
];

const updateRules = [
  param('id').isMongoId(),
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('isActive').optional().isBoolean().toBoolean(),
  body('isRestricted').optional().isBoolean().toBoolean(),
  body('sortOrder').optional().isInt({ min: 0 }).toInt(),
];

const idRule = [param('id').isMongoId()];

module.exports = { createRules, updateRules, idRule };