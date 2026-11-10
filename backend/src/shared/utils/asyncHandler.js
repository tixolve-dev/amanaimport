// backend/src/shared/utils/asyncHandler.js
'use strict';

/**
 * Wrap an async request handler and forward rejections to next(err).
 * @param {(req, res, next) => Promise<any>} fn
 * @returns {(req, res, next) => void}
 */
function asyncHandler(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('asyncHandler expects a function');
  }
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;