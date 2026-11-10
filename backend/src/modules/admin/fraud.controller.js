// backend/src/modules/admin/fraud.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./fraud.service');

async function submit(req, res, next) {
  try {
    const report = await service.submitReport({
      userId: req.user?.id || null,
      userRole: req.user?.role || null,
      payload: req.body,
    });
    return res.status(201).json(ApiResponse.created(report, 'Fraud report submitted'));
  } catch (err) { return next(err); }
}

async function adminList(req, res, next) {
  try {
    const { items, meta } = await service.adminList(req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function adminGet(req, res, next) {
  try {
    const doc = await service.adminGet(req.params.id);
    return res.status(200).json(ApiResponse.ok(doc));
  } catch (err) { return next(err); }
}

async function adminUpdate(req, res, next) {
  try {
    const doc = await service.adminUpdateStatus(req.user.id, req.params.id, req.body);
    return res.status(200).json(ApiResponse.ok(doc, 'Fraud report updated'));
  } catch (err) { return next(err); }
}

module.exports = { submit, adminList, adminGet, adminUpdate };