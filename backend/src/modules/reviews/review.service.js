// backend/src/modules/reviews/review.service.js
'use strict';

const mongoose = require('mongoose');
const { Review } = require('./review.model');
const { Order } = require('../orders/order.model');
const { ORDER_STATUS } = require('../orders/order.statuses');
const { ImporterProfile } = require('../importers/importerProfile.model');
const { ROLES } = require('../../shared/constants/roles');
const notificationService = require('../notifications/notification.service');
const { NOTIFICATION_TYPE } = require('../notifications/notification.model');
const ApiError = require('../../shared/utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

async function submitReview(userId, orderId, payload) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.buyer.toString() !== userId.toString()) {
    throw ApiError.forbidden('Only the buyer can review the importer');
  }
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw ApiError.conflict('Only completed orders can be reviewed', {
      code: 'ORDER_NOT_COMPLETED',
    });
  }

  const existing = await Review.findOne({ order: orderId });
  if (existing) {
    throw ApiError.conflict('This order has already been reviewed', { code: 'ALREADY_REVIEWED' });
  }

  const session = await mongoose.startSession();
  try {
    let review;
    await session.withTransaction(async () => {
      const [created] = await Review.create([{
        order: order._id,
        reviewer: userId,
        reviewee: order.importerUser,
        importerProfile: order.importerProfile,
        rating: payload.rating,
        comment: payload.comment || '',
        communicationRating: payload.communicationRating || null,
        deliveryRating: payload.deliveryRating || null,
        qualityRating: payload.qualityRating || null,
      }], { session });
      review = created;

      // Recompute importer aggregate atomically
      const agg = await Review.aggregate([
        { $match: { importerProfile: order.importerProfile } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]).session(session);

      if (agg[0]) {
        await ImporterProfile.updateOne(
          { _id: order.importerProfile },
          { $set: { ratingAverage: Math.round(agg[0].avg * 10) / 10, ratingCount: agg[0].count } },
          { session },
        );
      }
    });

    await notificationService.notify({
      recipientId: order.importerUser,
      type: NOTIFICATION_TYPE.REVIEW_RECEIVED,
      title: 'New review received',
      body: `You received a ${payload.rating}-star review for order ${order.referenceNumber}.`,
      data: { orderId: orderId.toString(), reviewId: review._id.toString() },
      event: { type: 'Review', targetId: review._id },
    });

    return review;
  } finally {
    await session.endSession();
  }
}

async function listForImporter(importerProfileId, query) {
  const { page, limit, skip } = parsePagination(query);
  const [items, total] = await Promise.all([
    Review.find({ importerProfile: importerProfileId })
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('reviewer', 'fullName'),
    Review.countDocuments({ importerProfile: importerProfileId }),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

module.exports = { submitReview, listForImporter };