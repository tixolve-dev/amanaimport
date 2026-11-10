// backend/src/shared/utils/tokenUtils.js
'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const ApiError = require('./ApiError');

/**
 * Sign a short-lived access token.
 * @param {{ id: string, role: string, status?: string }} payload
 */
function signAccessToken(payload) {
  return jwt.sign(
    { sub: payload.id, role: payload.role, status: payload.status },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn, issuer: 'ethio-marketplace' },
  );
}

/**
 * Verify an access token. Throws ApiError.unauthorized on failure.
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret, { issuer: 'ethio-marketplace' });
    if (!decoded.sub || !decoded.role) throw new Error('malformed payload');
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token expired', { code: 'TOKEN_EXPIRED' });
    }
    throw ApiError.unauthorized('Invalid access token', { code: 'INVALID_TOKEN' });
  }
}

/**
 * Create an opaque refresh token (NOT a JWT).
 * Returns { token, tokenHash, expiresAt }.
 */
function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = parseExpiry(env.jwt.refreshExpiresIn);
  return { token, tokenHash, expiresAt };
}

/**
 * SHA-256 hash of the raw refresh token. Only hashes are stored in DB.
 */
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Convert env string ('15m', '7d', '3600') to a Date in the future.
 */
function parseExpiry(value) {
  if (typeof value === 'number') return new Date(Date.now() + value * 1000);
  const m = String(value).match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`Invalid JWT expiry: ${value}`);
  const n = Number(m[1]);
  const unit = m[2];
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return new Date(Date.now() + n * ms);
}

/** SHA-256 hash for password-reset tokens. */
function hashGenericToken(raw) {
  return hashToken(raw);
}

/** Generate a random token (for password reset). */
function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
  hashToken,
  hashGenericToken,
  generateOpaqueToken,
  parseExpiry,
};