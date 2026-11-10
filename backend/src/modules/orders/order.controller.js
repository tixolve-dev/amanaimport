// backend/src/modules/orders/order.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./order.service');
const { ROLES } = require('../../shared/constants/roles');

async function listMine(req, res, next) {
  try {
    const { items, meta } = await service.listMyOrders(req.user.id, req.user.role, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function getOne(req, res, next) {
  try {
    const data = await service.getOrderForUser(req.user.id, req.params.id, req.user.role);
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
}

async function transition(req, res, next) {
  try {
    const order = await service.transitionOrder(
      req.user.id, req.user.role, req.params.id,
      req.body.action, { note: req.body.note || '' },
    );
    return res.status(200).json(ApiResponse.ok(order, `Transitioned to ${order.status}`));
  } catch (err) { return next(err); }
}

// ---------- Admin ----------

async function adminList(req, res, next) {
  try {
    const { items, meta } = await service.adminListOrders(req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function adminGet(req, res, next) {
  try {
    const order = await service.adminGetOrder(req.params.id);
    return res.status(200).json(ApiResponse.ok(order));
  } catch (err) { return next(err); }
}

async function adminTransition(req, res, next) {
  try {
    const order = await service.adminTransition(
      req.user.id, req.params.id, req.body.to, req.body.note || '',
    );
    return res.status(200).json(ApiResponse.ok(order, 'Admin transition applied'));
  } catch (err) { return next(err); }
}

module.exports = { listMine, getOne, transition, adminList, adminGet, adminTransition, ROLES };