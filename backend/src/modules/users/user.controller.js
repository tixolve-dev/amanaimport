// backend/src/modules/users/user.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./user.service');

async function getMe(req, res, next) {
  try {
    return res.status(200).json(ApiResponse.ok(await service.getMe(req.user.id)));
  } catch (err) { return next(err); }
}

async function updateMe(req, res, next) {
  try {
    return res.status(200).json(ApiResponse.ok(
      await service.updateMe(req.user.id, req.body), 'Profile updated',
    ));
  } catch (err) { return next(err); }
}

async function changePassword(req, res, next) {
  try {
    await service.changePassword(req.user.id, req.body);
    return res.status(200).json(ApiResponse.ok(null, 'Password changed'));
  } catch (err) { return next(err); }
}

async function updateFcmToken(req, res, next) {
  try {
    await service.updateFcmToken(req.user.id, req.body.token);
    return res.status(200).json(ApiResponse.ok(null, 'FCM token saved'));
  } catch (err) { return next(err); }
}

async function deleteMe(req, res, next) {
  try {
    await service.softDelete(req.user.id, req.body.password);
    return res.status(200).json(ApiResponse.ok(null, 'Account deleted'));
  } catch (err) { return next(err); }
}

module.exports = { getMe, updateMe, changePassword, updateFcmToken, deleteMe };