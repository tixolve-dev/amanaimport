// backend/src/shared/middleware/authenticate.js
'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokenUtils');
const { User } = require('../../modules/users/user.model');

/**
 * Require a valid access token. Attaches req.user (fresh from DB).
 * Rejects suspended or deleted accounts, even if the token is still valid.
 */
const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  const decoded = verifyAccessToken(token); // throws ApiError on failure

  const user = await User.findById(decoded.sub);
  if (!user || !user.isActive()) {
    throw ApiError.unauthorized('Account is inactive or no longer exists', {
      code: 'ACCOUNT_INACTIVE',
    });
  }

  req.user = user;
  req.auth = { token, decoded };
  next();
});

module.exports = { authenticate };