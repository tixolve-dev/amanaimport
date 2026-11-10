// backend/src/modules/shipments/shipment.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./shipment.service');

async function get(req, res, next) {
  try {
    const shipment = await service.getForOrder(req.user.id, req.user.role, req.params.orderId);
    return res.status(200).json(ApiResponse.ok(shipment));
  } catch (err) { return next(err); }
}

async function addEvent(req, res, next) {
  try {
    const shipment = await service.addEvent(req.user.id, req.user.role, req.params.orderId, req.body);
    return res.status(201).json(ApiResponse.created(shipment, 'Shipment event added'));
  } catch (err) { return next(err); }
}

module.exports = { get, addEvent };