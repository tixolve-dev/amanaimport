// backend/src/modules/disputes/dispute.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./dispute.service');

async function open(req, res, next) {
  try {
    const d = await service.openDispute(req.user.id, req.user.role, req.params.orderId, req.body);
    return res.status(201).json(ApiResponse.created(d, 'Dispute opened'));
  } catch (err) { return next(err); }
}
async function listForOrder(req, res, next) {
  try {
    const list = await service.listForOrder(req.user.id, req.params.orderId);
    return res.status(200).json(ApiResponse.ok(list));
  } catch (err) { return next(err); }
}
async function listMine(req, res, next) {
  try {
    const { items, meta } = await service.listMine(req.user.id, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}
async function addMessage(req, res, next) {
  try {
    const d = await service.addMessage(req.user.id, req.params.id, req.body.body);
    return res.status(200).json(ApiResponse.ok(d, 'Message added'));
  } catch (err) { return next(err); }
}
async function withdraw(req, res, next) {
  try {
    const d = await service.withdraw(req.user.id, req.params.id);
    return res.status(200).json(ApiResponse.ok(d, 'Dispute withdrawn'));
  } catch (err) { return next(err); }
}
// Admin
async function adminList(req, res, next) {
  try {
    const { items, meta } = await service.adminList(req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}
async function adminGet(req, res, next) {
  try {
    const d = await service.adminGet(req.params.id);
    return res.status(200).json(ApiResponse.ok(d));
  } catch (err) { return next(err); }
}
async function adminResolve(req, res, next) {
  try {
    const d = await service.adminResolve(req.user.id, req.params.id, req.body);
    return res.status(200).json(ApiResponse.ok(d, 'Dispute resolved'));
  } catch (err) { return next(err); }
}

module.exports = { open, listForOrder, listMine, addMessage, withdraw, adminList, adminGet, adminResolve };