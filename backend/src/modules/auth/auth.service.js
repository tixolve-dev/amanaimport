// backend/src/modules/auth/auth.service.js
'use strict';

const crypto = require('crypto');
const { User } = require('../users/user.model');
const { ROLES } = require('../../shared/constants/roles');
const { USER_STATUS, BUYER_TYPE } = require('../../shared/constants/statuses');
const ApiError = require('../../shared/utils/ApiError');
const {
  signAccessToken,
  createRefreshToken,
  hashToken,
  generateOpaqueToken,
  parseExpiry,
} = require('../../shared/utils/tokenUtils');

const MAX_ACTIVE_SESSIONS = 5;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

// ---- Helpers --------------------------------------------------------------

/**
 * Build the response payload for a successful auth action.
 * Never includes passwordHash or internal fields.
 */
function buildAuthResponse(user, refreshToken) {
  const publicUser = user.toJSON();
  return {
    user: publicUser,
    tokens: {
      accessToken: signAccessToken({
        id: publicUser.id,
        role: publicUser.role,
        status: publicUser.status,
      }),
      refreshToken,
      tokenType: 'Bearer',
    },
  };
}

/**
 * Persist a new refresh token (hashed) and prune old ones.
 * Keeps at most MAX_ACTIVE_SESSIONS non-revoked, non-expired tokens.
 */
async function persistRefreshToken(userId, tokenHash, expiresAt, meta = {}) {
  const now = Date.now();
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) throw ApiError.unauthorized('User no longer exists');

  // Remove expired or revoked
  user.refreshTokens = user.refreshTokens.filter(
    (t) => !t.revokedAt && t.expiresAt.getTime() > now,
  );

  // Cap sessions
  while (user.refreshTokens.length >= MAX_ACTIVE_SESSIONS) {
    user.refreshTokens.shift();
  }

  user.refreshTokens.push({
    tokenHash,
    expiresAt,
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  });

  await user.save();
}

/**
 * Find a user by either email or Ethiopian phone.
 */
async function findByEmailOrPhone(identifier) {
  const isEmail = identifier.includes('@');
  const query = isEmail
    ? { email: identifier.toLowerCase().trim() }
    : { phone: identifier.trim() };
  return User.findOne(query).select('+passwordHash');
}

// ---- Public API -----------------------------------------------------------

/**
 * Register a new user.
 * Only buyer/importer may self-register. Buyers may choose buyerType.
 */
async function register({ fullName, email, phone, password, role, buyerType, preferredLanguage }, meta = {}) {
  if (![ROLES.BUYER, ROLES.IMPORTER].includes(role)) {
    throw ApiError.forbidden('Role is not available for self-registration');
  }

  // Pre-check for friendly errors (uniqueness also enforced by DB index)
  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { phone }],
  }).select('email phone');
  if (existing) {
    const field = existing.email === email.toLowerCase() ? 'email' : 'phone';
    throw ApiError.conflict(`A user with this ${field} already exists`, {
      code: 'USER_EXISTS',
      details: { field },
    });
  }

  const user = new User({
    fullName,
    email: email.toLowerCase(),
    phone,
    role,
    status: USER_STATUS.ACTIVE,
    buyerType: role === ROLES.BUYER ? (buyerType || BUYER_TYPE.INDIVIDUAL) : null,
    preferredLanguage: preferredLanguage || 'en',
  });

  await user.setPassword(password);
  await user.save();

  const { token: refreshToken, tokenHash, expiresAt } = createRefreshToken();
  await persistRefreshToken(user._id, tokenHash, expiresAt, meta);

  return buildAuthResponse(user, refreshToken);
}

/**
 * Login by email or phone.
 * Generic error message on failure (prevents account enumeration).
 */
async function login({ identifier, password }, meta = {}) {
  const user = await findByEmailOrPhone(identifier);
  const invalid = () => ApiError.unauthorized('Invalid email/phone or password', {
    code: 'INVALID_CREDENTIALS',
  });

  if (!user) throw invalid();

  if (!user.isActive()) {
    throw ApiError.forbidden('Account is suspended or inactive', { code: 'ACCOUNT_INACTIVE' });
  }

  const ok = await user.comparePassword(password);
  if (!ok) throw invalid();

  user.lastLoginAt = new Date();
  await user.save();

  const { token: refreshToken, tokenHash, expiresAt } = createRefreshToken();
  await persistRefreshToken(user._id, tokenHash, expiresAt, meta);

  return buildAuthResponse(user, refreshToken);
}

/**
 * Rotate refresh token: find matching hash, revoke it, issue a new pair.
 * Token reuse is detected by absence — reuse of an old token simply fails.
 */
async function refresh({ refreshToken }, meta = {}) {
  const tokenHash = hashToken(refreshToken);
  const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash })
    .select('+refreshTokens');

  if (!user) {
    throw ApiError.unauthorized('Invalid or expired refresh token', {
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  const stored = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
  if (!stored) {
    throw ApiError.unauthorized('Invalid refresh token', { code: 'INVALID_REFRESH_TOKEN' });
  }
  if (stored.revokedAt) {
    // Possible theft — revoke all for this user, force re-login
    user.refreshTokens.forEach((t) => { if (!t.revokedAt) t.revokedAt = new Date(); });
    await user.save();
    throw ApiError.unauthorized('Refresh token has been revoked', {
      code: 'REFRESH_TOKEN_REVOKED',
    });
  }
  if (stored.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Refresh token expired', { code: 'REFRESH_TOKEN_EXPIRED' });
  }
  if (!user.isActive()) {
    throw ApiError.forbidden('Account is inactive', { code: 'ACCOUNT_INACTIVE' });
  }

  // Rotate
  stored.revokedAt = new Date();
  const { token: newRefresh, tokenHash: newHash, expiresAt } = createRefreshToken();
  user.refreshTokens.push({
    tokenHash: newHash,
    expiresAt,
    userAgent: meta.userAgent || stored.userAgent,
    ip: meta.ip || stored.ip,
  });
  await user.save();

  return buildAuthResponse(user, newRefresh);
}

/**
 * Logout — revoke one refresh token (all sessions if `allSessions: true`).
 */
async function logout({ userId, refreshToken, allSessions = false }) {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return; // idempotent

  if (allSessions) {
    user.refreshTokens.forEach((t) => { if (!t.revokedAt) t.revokedAt = new Date(); });
  } else if (refreshToken) {
    const hash = hashToken(refreshToken);
    const stored = user.refreshTokens.find((t) => t.tokenHash === hash);
    if (stored && !stored.revokedAt) stored.revokedAt = new Date();
  }
  await user.save();
}

/**
 * Forgot password — generate reset token, store hash + expiry.
 * Always resolves successfully to prevent enumeration.
 * Returns { resetToken } so controller can log/email it in dev.
 */
async function forgotPassword({ email }) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive()) {
    // Do not reveal user existence
    return { delivered: false };
  }

  const raw = generateOpaqueToken(32);
  user.passwordResetTokenHash = hashToken(raw);
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save({ validateBeforeSave: false });

  // In a real deployment, send via email/SMS. In dev, log to console.
  return { delivered: true, resetToken: raw };
}

/**
 * Reset password with a valid token. Revokes all sessions.
 */
async function resetPassword({ token, password }) {
  const hash = hashToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: hash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt +refreshTokens');

  if (!user) {
    throw ApiError.badRequest('Invalid or expired reset token', { code: 'INVALID_RESET_TOKEN' });
  }

  await user.setPassword(password);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.refreshTokens.forEach((t) => { if (!t.revokedAt) t.revokedAt = new Date(); });
  await user.save();

  return { success: true };
}

/**
 * Get the current user (used by /me). Returns safe public shape.
 */
async function getCurrentUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return user.toJSON();
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
};