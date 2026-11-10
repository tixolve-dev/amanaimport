// backend/src/modules/users/user.service.js
'use strict';

const { User } = require('./user.model');
const ApiError = require('../../shared/utils/ApiError');

async function getMe(userId) {
  const u = await User.findById(userId);
  if (!u) throw ApiError.notFound('User not found');
  return u.toJSON();
}

async function updateMe(userId, patch) {
  const ALLOWED = ['fullName', 'preferredLanguage', 'buyerType'];
  const doc = await User.findById(userId);
  if (!doc) throw ApiError.notFound('User not found');
  for (const k of ALLOWED) {
    if (patch[k] !== undefined) doc[k] = patch[k];
  }
  await doc.save();
  return doc.toJSON();
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const doc = await User.findById(userId).select('+passwordHash');
  if (!doc) throw ApiError.notFound('User not found');
  const ok = await doc.comparePassword(currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');
  await doc.setPassword(newPassword);
  // Revoke all refresh tokens on password change
  const withTokens = await User.findById(userId).select('+refreshTokens');
  withTokens.refreshTokens.forEach((t) => { if (!t.revokedAt) t.revokedAt = new Date(); });
  await withTokens.save();
  return { changed: true };
}

async function updateFcmToken(userId, token) {
  await User.updateOne({ _id: userId }, { $set: { fcmToken: token } });
  return { updated: true };
}

async function softDelete(userId, password) {
  const doc = await User.findById(userId).select('+passwordHash');
  if (!doc) throw ApiError.notFound('User not found');
  const ok = await doc.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Password is incorrect');
  doc.status = 'deleted';
  doc.deletedAt = new Date();
  await doc.save();
  return { deleted: true };
}

module.exports = { getMe, updateMe, changePassword, updateFcmToken, softDelete };