// backend/src/modules/requests/request.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./request.service');

async function create(req, res, next) {
  try {
    const doc = await service.createRequest(req.user.id, req.body);
    return res.status(201).json(ApiResponse.created(doc, 'Request created'));
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const doc = await service.updateRequest(req.user.id, req.params.id, req.body);
    return res.status(200).json(ApiResponse.ok(doc, 'Request updated'));
  } catch (err) { return next(err); }
}

async function publish(req, res, next) {
  try {
    const doc = await service.publishRequest(req.user.id, req.params.id);
    return res.status(200).json(ApiResponse.ok(doc, 'Request published'));
  } catch (err) { return next(err); }
}

async function cancel(req, res, next) {
  try {
    const doc = await service.cancelRequest(
      req.user.id, req.params.id, req.body.reason || '',
    );
    return res.status(200).json(ApiResponse.ok(doc, 'Request cancelled'));
  } catch (err) { return next(err); }
}

async function getMine(req, res, next) {
  try {
    const doc = await service.getMyRequest(req.user.id, req.params.id);
    return res.status(200).json(ApiResponse.ok(doc));
  } catch (err) { return next(err); }
}

async function listMine(req, res, next) {
  try {
    const { items, meta } = await service.listMyRequests(req.user.id, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function discover(req, res, next) {
  try {
    const { items, meta } = await service.discoverRequests(req.user.id, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function discoverDetail(req, res, next) {
  try {
    const doc = await service.discoverRequestDetail(req.user.id, req.params.id);
    return res.status(200).json(ApiResponse.ok(doc));
  } catch (err) { return next(err); }
}

module.exports = {
  create, update, publish, cancel, getMine, listMine, discover, discoverDetail,
};