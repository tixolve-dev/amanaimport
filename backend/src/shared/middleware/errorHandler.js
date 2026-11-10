// backend/src/shared/middleware/errorHandler.js
'use strict';

const mongoose = require('mongoose');
const env = require('../../config/env');
const logger = require('../../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Normalize any error into ApiError-like shape { statusCode, code, message, details }.
 * @param {any} err
 * @returns {ApiError}
 */
function normalizeError(err) {
  if (err instanceof ApiError) return err;

  // Mongoose validation
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.validation('Validation failed', details, { cause: err });
  }

  // Mongoose cast (bad ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${err.path}"`, {
      code: 'CAST_ERROR',
      details: { field: err.path, value: err.value },
      cause: err,
    });
  }

  // Mongo duplicate key
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`Duplicate value for "${field}"`, {
      code: 'DUPLICATE_KEY',
      details: err.keyValue,
      cause: err,
    });
  }

  // JWT
  if (err && err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid token', { code: 'INVALID_TOKEN', cause: err });
  }
  if (err && err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token expired', { code: 'TOKEN_EXPIRED', cause: err });
  }

  // Multer
  if (err && err.name === 'MulterError') {
    return ApiError.badRequest(`Upload error: ${err.message}`, {
      code: 'UPLOAD_ERROR',
      details: { field: err.field, limit: err.code },
      cause: err,
    });
  }

  // JSON body parse
  if (err && err.type === 'entity.parse.failed') {
    return ApiError.badRequest('Malformed JSON body', { code: 'INVALID_JSON', cause: err });
  }

  // Unknown / programmer error
  return ApiError.internal('Something went wrong', { cause: err });
}

/**
 * Build the JSON body we return to clients.
 * Never include stack/details for non-operational errors in production.
 */
function buildBody(apiError, requestId) {
  const body = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
    },
    requestId,
  };

  if (apiError.details !== undefined) {
    body.error.details = apiError.details;
  }

  if (!env.isProd) {
    body.error.stack = apiError.stack;
    if (apiError.cause) {
      body.error.cause = {
        name: apiError.cause.name,
        message: apiError.cause.message,
      };
    }
  }

  return body;
}

/**
 * Express error middleware. Must be registered LAST.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const apiError = normalizeError(err);
  const requestId = req.id || req.headers['x-request-id'] || null;

  // Log: warn for operational (expected), error for unexpected (bugs)
  const logMeta = {
    method: req.method,
    url: req.originalUrl,
    statusCode: apiError.statusCode,
    code: apiError.code,
    requestId,
    userId: req.user?.id,
  };

  if (apiError.isOperational) {
    logger.warn(`[error] ${apiError.message}`, logMeta);
  } else {
    logger.error(`[error] ${apiError.message}`, { ...logMeta, stack: err.stack });
  }

  if (res.headersSent) {
    // Delegate if response already started — nothing else we can do
    return next(err);
  }

  res.status(apiError.statusCode).json(buildBody(apiError, requestId));
}

/**
 * 404 catch-all — mount after all routes.
 */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, {
    code: 'ROUTE_NOT_FOUND',
  }));
}

module.exports = { errorHandler, notFoundHandler };