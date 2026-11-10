// backend/src/modules/commissions/commission.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./commission.service');

async function create(req, res, next) {
  try {
    const rule = await service.createRule(req.user.id, req.body);
    return res.status(201).json(ApiResponse.created(rule, 'Commission rule created'));
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const rule = await service.updateRule(req.user.id, req.params.id, req.body);
    return res.status(200).json(ApiResponse.ok(rule, 'Rule updated'));
  } catch (err) { return next(err); }
}

async function list(req, res, next) {
  try {
    const { items, meta } = await service.listRules(req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function remove(req, res, next) {
  try {
    const result = await service.deleteRule(req.params.id);
    return res.status(200).json(ApiResponse.ok(result, 'Rule deactivated'));
  } catch (err) { return next(err); }
}

async function listRecords(req, res, next) {
  try {
    const { items, meta } = await service.listRecords(req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function revenueSummary(req, res, next) {
  try {
    const data = await service.revenueSummary({
      from: req.query.from, to: req.query.to,
    });
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
}

async function transition(req, res, next) {
  try {
    const record = await service.transitionRevenueState(
      req.user.id, req.params.id, req.body.to,
      req.body.note || '', req.body.reason || '',
    );
    return res.status(200).json(ApiResponse.ok(record, 'Revenue state updated'));
  } catch (err) { return next(err); }
}

module.exports = { create, update, list, remove, listRecords, revenueSummary, transition };