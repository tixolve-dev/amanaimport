// backend/src/shared/middleware/authorize.js
'use strict';

const ApiError = require('../utils/ApiError');

/**
 * @param  {...string} allowedRoles
 * @returns Express middleware
 */
function authorize(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error('authorize() requires at least one role');
  }
  return function authorizeMiddleware(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access denied — requires role: ${allowedRoles.join(' or ')}`,
          { code: 'ROLE_NOT_ALLOWED' },
        ),
      );
    }
    next();
  };
}

module.exports = { authorize };