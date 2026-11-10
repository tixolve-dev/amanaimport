// backend/src/modules/payments/payment.service.js
'use strict';

const mongoose = require('mongoose');
const { PaymentRecord, PAYMENT_STATUS } = require('./paymentRecord.model');
const { Order } = require('../orders/order.model');
const { ORDER_STATUS } = require('../orders/order.statuses');
const orderService = require('../orders/order.service');
const manualProvider = require('./manualProvider');
const { ROLES } = require('../../shared/constants/roles');
const ApiError = require('../../shared/utils/ApiError');
const auditService = require('../admin/auditLog.service');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');
const env = require('../../config/env'); // eslint-disable-line no-unused-vars
const cloudinaryService = require('../uploads/cloudinary.service');

/**
 * Adds a ready-to-open receipt URL (signed when the asset is private) to a
 * payment record, so clients never need to build Cloudinary URLs themselves.
 */
const withView = (doc) => {
  const o = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  o.receiptViewUrl = cloudinaryService.receiptViewUrl(o);
  return o;
};

// ---------- Buyer: instructions ----------

async function getPaymentInstructions(buyerId, orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.buyer.toString() !== buyerId.toString()) {
    throw ApiError.forbidden('You do not have access to this order');
  }

  if (order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
    throw ApiError.conflict(
      `Order is not awaiting payment (status: ${order.status})`,
      { code: 'NOT_AWAITING_PAYMENT' },
    );
  }

  const provider = manualProvider; // default for Phase 1.6
  const instructions = await provider.instructions(order);

  const existing = await PaymentRecord.findOne({
    order: order._id,
    status: PAYMENT_STATUS.SUBMITTED,
  });

  return { instructions, hasPendingSubmission: Boolean(existing) };
}

// ---------- Buyer: submit evidence ----------

async function submitEvidence(buyerId, orderId, payload) {
  // Verify the receipt BEFORE opening the DB transaction: it can make a network
  // call to Cloudinary, and we do not want to hold a transaction open for that.
  let receipt = {
    key: null, url: null, mimeType: null, provider: 'storage', deliveryType: 'upload',
  };

  if (payload.receiptKey) {
    if (payload.receiptProvider === 'cloudinary') {
      // Never trust the URL sent by the client: confirm the file exists in OUR
      // Cloudinary account and use the values Cloudinary returns.
      const v = await cloudinaryService.verifyReceipt({
        key: payload.receiptKey,
        url: payload.receiptUrl,
        deliveryType: payload.receiptDeliveryType,
      });
      receipt = {
        key: v.key,
        url: v.url,
        mimeType: v.mimeType,
        provider: 'cloudinary',
        deliveryType: v.deliveryType,
      };
    } else {
      // Legacy path: file was uploaded through our own upload endpoint.
      // eslint-disable-next-line global-require
      const { storage } = require('../uploads/storage.provider');
      if (!(await storage.exists(payload.receiptKey))) {
        throw ApiError.badRequest('Receipt file not found');
      }
      receipt = {
        key: payload.receiptKey,
        url: payload.receiptUrl || null,
        mimeType: payload.receiptMimeType || null,
        provider: 'storage',
        deliveryType: 'upload',
      };
    }
  }

  const session = await mongoose.startSession();
  try {
    let record;
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw ApiError.notFound('Order not found');
      if (order.buyer.toString() !== buyerId.toString()) {
        throw ApiError.forbidden('You do not own this order');
      }
      if (order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
        throw ApiError.conflict(
          `Order is not awaiting payment (status: ${order.status})`,
          { code: 'NOT_AWAITING_PAYMENT' },
        );
      }

      // Duplicate active submission guard (also enforced by partial unique index)
      const existingActive = await PaymentRecord.findOne({
        order: order._id,
        status: { $in: [PAYMENT_STATUS.SUBMITTED, PAYMENT_STATUS.VERIFIED] },
      }).session(session);
      if (existingActive) {
        throw ApiError.conflict('An active payment record already exists for this order', {
          code: 'PAYMENT_ALREADY_SUBMITTED',
        });
      }

      const paidAt = new Date(payload.paidAt);
      if (Number.isNaN(paidAt.getTime())) {
        throw ApiError.badRequest('paidAt is invalid');
      }
      if (paidAt.getTime() > Date.now() + 60_000) { // allow small skew
        throw ApiError.badRequest('paidAt cannot be in the future');
      }

      const [created] = await PaymentRecord.create([{
        order: order._id,
        buyer: buyerId,
        transactionReference: payload.transactionReference.trim(),
        amountETB: payload.amountETB,
        paymentChannel: payload.paymentChannel,
        paidAt,
        receiptKey: receipt.key,
        receiptUrl: receipt.url,
        receiptMimeType: receipt.mimeType,
        receiptProvider: receipt.provider,
        receiptDeliveryType: receipt.deliveryType,
        status: PAYMENT_STATUS.SUBMITTED,
        reviewHistory: [{
          action: 'submitted',
          actor: buyerId,
          actorRole: ROLES.BUYER,
          note: 'Evidence submitted by buyer - awaiting admin review',
        }],
      }], { session });

      record = created;
    });
    return record;
  } finally {
    await session.endSession();
  }
}

// ---------- Buyer: view own payment records for order ----------

async function listMyPaymentsForOrder(buyerId, orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.buyer.toString() !== buyerId.toString()) {
    throw ApiError.forbidden('You do not have access to this order');
  }
  const items = await PaymentRecord.find({ order: orderId }).sort({ createdAt: -1 });
  return items.map(withView);
}

// ---------- Admin: review ----------

const VALID_REVIEW_ACTIONS = Object.freeze({
  verify: { to: PAYMENT_STATUS.VERIFIED },
  reject: { to: PAYMENT_STATUS.REJECTED },
  reverse: { to: PAYMENT_STATUS.REVERSED },
  dispute: { to: PAYMENT_STATUS.DISPUTED },
});

const ALLOWED_SOURCE_STATES = Object.freeze({
  verify: [PAYMENT_STATUS.SUBMITTED],
  reject: [PAYMENT_STATUS.SUBMITTED],
  reverse: [PAYMENT_STATUS.VERIFIED],
  dispute: [PAYMENT_STATUS.VERIFIED],
});

async function adminReviewPayment(adminId, recordId, { action, note = '', rejectionReason = '' }) {
  const rule = VALID_REVIEW_ACTIONS[action];
  if (!rule) {
    throw ApiError.badRequest(`Unknown payment action: ${action}`, {
      code: 'UNKNOWN_ACTION',
    });
  }

  const session = await mongoose.startSession();
  try {
    let record;
    await session.withTransaction(async () => {
      const doc = await PaymentRecord.findById(recordId).session(session);
      if (!doc) throw ApiError.notFound('Payment record not found');

      if (!ALLOWED_SOURCE_STATES[action].includes(doc.status)) {
        throw ApiError.conflict(
          `Cannot "${action}" a payment in "${doc.status}" state`,
          { code: 'INVALID_PAYMENT_STATE' },
        );
      }

      const previousStatus = doc.status;
      doc.status = rule.to;
      doc.reviewedBy = adminId;
      doc.reviewedAt = new Date();
      if (action === 'reject') doc.rejectionReason = rejectionReason || 'Rejected by admin';
      doc.reviewHistory.push({
        action: rule.to,
        actor: adminId,
        actorRole: ROLES.ADMIN,
        note,
      });
      await doc.save({ session });

      // Side effect on order
      if (action === 'verify') {
        // Payment condition satisfied -> order can progress
        await orderService.markPaymentSatisfied(doc.order, {
          verifiedBy: adminId,
          note: note || 'Payment verified by admin',
          session,
        });
      }
      if (action === 'reverse' || action === 'dispute') {
        // TODO (Phase 1.7): transition to refund/dispute flow.
        // For now, surface to admin via record.status only.
      }

      record = doc;
      await auditService.record({
        actorId: adminId,
        actorRole: ROLES.ADMIN,
        action: `payment.${action}`,
        targetType: 'PaymentRecord',
        targetId: doc._id,
        summary: `Payment ${action}`,
        before: { status: previousStatus },
        after: { status: rule.to },
      });
    });
    return record;
  } finally {
    await session.endSession();
  }
}

// ---------- Admin: listing ----------

async function adminListPayments(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    PaymentRecord.find(filter)
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('order', 'referenceNumber status totalPriceETB buyer importerUser')
      .populate('buyer', 'fullName email phone'),
    PaymentRecord.countDocuments(filter),
  ]);
  return {
    items: items.map(withView),
    meta: buildPaginationMeta({ page, limit, total }),
  };
}

async function adminGetPayment(recordId) {
  const record = await PaymentRecord.findById(recordId)
    .populate('order')
    .populate('buyer', 'fullName email phone')
    .populate('reviewedBy', 'fullName email');
  if (!record) throw ApiError.notFound('Payment record not found');
  return withView(record);
}

module.exports = {
  getPaymentInstructions,
  submitEvidence,
  listMyPaymentsForOrder,
  adminReviewPayment,
  adminListPayments,
  adminGetPayment,
  PAYMENT_STATUS,
};