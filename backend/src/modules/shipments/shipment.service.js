// backend/src/modules/shipments/shipment.service.js
'use strict';

const { Shipment } = require('./shipment.model');
const { Order } = require('../orders/order.model');
const { OrderStatus } = require('../orders/order.statuses');
const { ROLES } = require('../../shared/constants/roles');
const ApiError = require('../../shared/utils/ApiError');

async function getOrCreate(order) {
  let shipment = await Shipment.findOne({ order: order._id });
  if (!shipment) {
    shipment = await Shipment.create({
      order: order._id,
      destinationCity: order.snapshot?.deliveryCity || '',
    });
  }
  return shipment;
}

async function getForOrder(userId, role, orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  const isBuyer = order.buyer.toString() === userId.toString();
  const isImporter = order.importerUser.toString() === userId.toString();
  if (role !== ROLES.ADMIN && !isBuyer && !isImporter) {
    throw ApiError.forbidden('You do not have access to this order');
  }
  return getOrCreate(order);
}

async function addEvent(userId, role, orderId, payload) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  const isImporter = order.importerUser.toString() === userId.toString();
  if (role !== ROLES.ADMIN && !(role === ROLES.IMPORTER && isImporter)) {
    throw ApiError.forbidden('Only the importer or admin can post shipment events');
  }

  const occurredAt = new Date(payload.occurredAt);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 60_000) {
    throw ApiError.badRequest('occurredAt invalid or in the future');
  }

  const shipment = await getOrCreate(order);
  shipment.events.push({
    stage: payload.stage,
    description: payload.description || '',
    location: payload.location || '',
    occurredAt,
    evidenceKey: payload.evidenceKey || null,
    evidenceUrl: payload.evidenceUrl || null,
    addedBy: userId,
    addedByRole: role,
  });
  if (payload.trackingNumber) shipment.trackingNumber = payload.trackingNumber;
  if (payload.carrier) shipment.carrier = payload.carrier;
  await shipment.save();
  return shipment;
}

module.exports = { getForOrder, addEvent };