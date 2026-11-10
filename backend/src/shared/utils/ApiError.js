// backend/src/shared/utils/ApiError.js
'use strict';

/**
 * Application-level error that the global error handler knows how to format.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status code
   * @param {string} message     Safe, human-readable message
   * @param {object} [opts]
   * @param {string} [opts.code]           Machine-readable error code
   * @param {any}    [opts.details]        Validation details / extra info
   * @param {boolean}[opts.isOperational]  true = expected, not a bug
   * @param {Error}  [opts.cause]          Original error
   */
  constructor(statusCode, message, opts = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = opts.code || defaultCode(statusCode);
    this.details = opts.details;
    this.isOperational = opts.isOperational ?? true;
    if (opts.cause) this.cause = opts.cause;
    Error.captureStackTrace?.(this, this.constructor);
  }

  // ---- Factory helpers ---------------------------------------------------

  static badRequest(message = 'Bad request', opts = {}) {
    return new ApiError(400, message, { code: 'BAD_REQUEST', ...opts });
  }

  static unauthorized(message = 'Unauthorized', opts = {}) {
    return new ApiError(401, message, { code: 'UNAUTHORIZED', ...opts });
  }

  static forbidden(message = 'Forbidden', opts = {}) {
    return new ApiError(403, message, { code: 'FORBIDDEN', ...opts });
  }

  static notFound(message = 'Resource not found', opts = {}) {
    return new ApiError(404, message, { code: 'NOT_FOUND', ...opts });
  }

  static conflict(message = 'Conflict', opts = {}) {
    return new ApiError(409, message, { code: 'CONFLICT', ...opts });
  }

  static tooManyRequests(message = 'Too many requests', opts = {}) {
    return new ApiError(429, message, { code: 'TOO_MANY_REQUESTS', ...opts });
  }

  static validation(message = 'Validation failed', details, opts = {}) {
    return new ApiError(422, message, { code: 'VALIDATION_ERROR', details, ...opts });
  }

  static internal(message = 'Internal server error', opts = {}) {
    return new ApiError(500, message, {
      code: 'INTERNAL_ERROR',
      isOperational: false,
      ...opts,
    });
  }
}

function defaultCode(statusCode) {
  const map = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  return map[statusCode] || 'ERROR';
}

module.exports = ApiError;