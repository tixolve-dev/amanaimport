// backend/src/modules/disputes/dispute.service.js
'use strict';

const { Dispute, DISPUTE_STATUS } = require('./dispute.model');
const { Order } = require('../orders/order.model');
const { ORDER_STATUS } = require('../orders/order.statuses');
const { transition } = require('../orders/orderStateMachine');
const { ROLES } = require('../../shared/constants/roles');
const notificationService = require('../notifications/notification.service');
const { NOTIFICATION_TYPE } = require('../notifications/notification.model');
const ApiError = require('../../shared/utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

async function openDispute(userId, role, orderId, payload) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  const isBuyer = order.buyer.toString() === userId.toString();
  const isImporter = order.importerUser.toString() === userId.toString();
  if (!isBuyer && !isImporter) throw ApiError.forbidden('Not a participant');

  if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED].includes(order.status)) {
    throw ApiError.conflict('Cannot open a dispute on a cancelled or refunded order');
  }

  const existingOpen = await Dispute.findOne({
    order: orderId,
    status: { $in: [DISPUTE_STATUS.OPEN, DISPUTE_STATUS.UNDER_REVIEW] },
  });
  if (existingOpen) {
    throw ApiError.conflict('An open dispute already exists for this order', {
      code: 'DISPUTE_EXISTS',
    });
  }

  // Transition order to DISPUTED (allowed from most active states)
  if (order.status !== ORDER_STATUS.DISPUTED) {
    transition(order, ORDER_STATUS.DISPUTED, {
      actorId: userId,
      actorRole: role,
      note: `Dispute opened: ${payload.reason}`,
    });
    await order.save();
  }

  const dispute = await Dispute.create({
    order: orderId,
    openedBy: userId,
    openedByRole: role,
    reason: payload.reason,
    description: payload.description,
    evidence: (payload.evidence || []).map((e) => ({
      key: e.key, url: e.url, mimeType: e.mimeType || null,
      description: e.description || '',
      addedBy: userId, addedByRole: role,
    })),
  });

  const other = isBuyer ? order.importerUser : order.buyer;
  await notificationService.notify({
    recipientId: other,
    type: NOTIFICATION_TYPE.DISPUTE_OPENED,
    title: 'Dispute opened on your order',
    body: `A dispute was opened for order ${order.referenceNumber}.`,
    data: { orderId: orderId.toString(), disputeId: dispute._id.toString() },
    event: { type: 'Dispute', targetId: dispute._id },
  });

  return dispute;
}

async function listForOrder(userId, orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  const isBuyer = order.buyer.toString() === userId.toString();
  const isImporter = order.importerUser.toString() === userId.toString();
  if (!isBuyer && !isImporter) throw ApiError.forbidden('Not a participant');
  return Dispute.find({ order: orderId }).sort({ createdAt: -1 });
}

async function listMine(userId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { openedBy: userId };
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    Dispute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('order', 'referenceNumber status totalPriceETB'),
    Dispute.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

async function addMessage(userId, disputeId, body) {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw ApiError.notFound('Dispute not found');
  const order = await Order.findById(dispute.order);
  if (!order) throw ApiError.notFound('Order not found');
  const isBuyer = order.buyer.toString() === userId.toString();
  const isImporter = order.importerUser.toString() === userId.toString();
  if (!isBuyer && !isImporter) throw ApiError.forbidden('Not a participant');
  if ([DISPUTE_STATUS.RESOLVED_BUYER_FAVOR, DISPUTE_STATUS.RESOLVED_IMPORTER_FAVOR,
    DISPUTE_STATUS.RESOLVED_MUTUAL, DISPUTE_STATUS.WITHDRAWN].includes(dispute.status)) {
    throw ApiError.conflict('Dispute is resolved — cannot add messages');
  }

  dispute.messages.push({
    author: userId,
    authorRole: isBuyer ? 'buyer' : 'importer',
    body,
  });
  await dispute.save();
  return dispute;
}

async function withdraw(userId, disputeId) {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw ApiError.notFound('Dispute not found');
  if (dispute.openedBy.toString() !== userId.toString()) {
    throw ApiError.forbidden('Only the opener can withdraw');
  }
  if (![DISPUTE_STATUS.OPEN, DISPUTE_STATUS.UNDER_REVIEW].includes(dispute.status)) {
    throw ApiError.conflict('Dispute is already resolved');
  }
  dispute.status = DISPUTE_STATUS.WITHDRAWN;
  await dispute.save();
  return dispute;
}

// ---------- Admin ----------

async function adminList(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    Dispute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('order', 'referenceNumber status totalPriceETB buyer importerUser')
      .populate('openedBy', 'fullName email role'),
    Dispute.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

async function adminGet(disputeId) {
  const dispute = await Dispute.findById(disputeId)
    .populate('order')
    .populate('openedBy', 'fullName email role');
  if (!dispute) throw ApiError.notFound('Dispute not found');
  return dispute;
}

async function adminResolve(adminId, disputeId, payload) {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw ApiError.notFound('Dispute not found');
  if (![DISPUTE_STATUS.OPEN, DISPUTE_STATUS.UNDER_REVIEW].includes(dispute.status)) {
    throw ApiError.conflict('Dispute is already resolved');
  }

  const allowedOutcomes = [
    DISPUTE_STATUS.RESOLVED_BUYER_FAVOR,
    DISPUTE_STATUS.RESOLVED_IMPORTER_FAVOR,
    DISPUTE_STATUS.RESOLVED_MUTUAL,
  ];
  if (!allowedOutcomes.includes(payload.outcome)) {
    throw ApiError.badRequest('Invalid resolution outcome');
  }

  dispute.status = payload.outcome;
  dispute.resolution = {
    outcome: payload.outcome,
    resolvedBy: adminId,
    resolvedAt: new Date(),
    notes: payload.notes || '',
    refundPromisedETB: payload.refundPromisedETB != null ? payload.refundPromisedETB : null,
  };
  await dispute.save();

    await require('../admin/auditLog.service').record({
    actorId: adminId,
    actorRole: ROLES.ADMIN,
    action: 'dispute.resolve',
    targetType: 'Dispute',
    targetId: dispute._id,
    summary: `Resolved: ${payload.outcome}`,
    after: { status: dispute.status, refundPromisedETB: payload.refundPromisedETB || 0 },
  });
  
  // If resolved in buyer's favor with refund promise, move order to refund_pending
  const order = await Order.findById(dispute.order);
  if (order && payload.outcome === DISPUTE_STATUS.RESOLVED_BUYER_FAVOR
      && payload.refundPromisedETB > 0) {
    try {
      transition(order, ORDER_STATUS.REFUND_PENDING, {
        actorId: adminId, actorRole: ROLES.ADMIN,
        note: `Dispute resolved — refund of ${payload.refundPromisedETB} ETB promised`,
      });
      await order.save();
    } catch (err) {
      // Order state may not allow direct transition to refund_pending; leave for admin
    }
  }

  for (const recipientId of [order?.buyer, order?.importerUser].filter(Boolean)) {
    await notificationService.notify({
      recipientId,
      type: NOTIFICATION_TYPE.DISPUTE_RESOLVED,
      title: 'Dispute resolved',
      body: `Dispute on order ${order.referenceNumber} was resolved: ${payload.outcome}`,
      data: { orderId: order._id.toString(), disputeId: dispute._id.toString() },
      event: { type: 'Dispute', targetId: dispute._id },
    });
  }

  return dispute;
}

module.exports = {
  openDispute,
  listForOrder,
  listMine,
  addMessage,
  withdraw,
  adminList,
  adminGet,
  adminResolve,
  DISPUTE_STATUS,
};