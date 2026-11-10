// backend/src/modules/notifications/notification.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const NOTIFICATION_TYPE = Object.freeze({
  // Quotation events
  QUOTATION_SUBMITTED: 'quotation_submitted',
  QUOTATION_ACCEPTED: 'quotation_accepted',
  QUOTATION_REJECTED: 'quotation_rejected',
  // Request events
  REQUEST_PUBLISHED: 'request_published',
  REQUEST_EXPIRED: 'request_expired',
  REQUEST_CANCELLED: 'request_cancelled',
  // Order events
  ORDER_CREATED: 'order_created',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  ORDER_COMPLETED: 'order_completed',
  ORDER_CANCELLED: 'order_cancelled',
  // Payment
  PAYMENT_VERIFIED: 'payment_verified',
  PAYMENT_REJECTED: 'payment_rejected',
  // Disputes
  DISPUTE_OPENED: 'dispute_opened',
  DISPUTE_RESOLVED: 'dispute_resolved',
  // Reviews
  REVIEW_RECEIVED: 'review_received',
  // System
  SYSTEM: 'system',
});

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1000 },
    data: { type: Schema.Types.Mixed, default: {} }, // deep-link payload
    readAt: { type: Date, default: null, index: true },
    // The persisted domain event this notification refers to (prompt §13.13)
    event: {
      type: { type: String, required: true },
      targetId: { type: Schema.Types.ObjectId, required: true },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = { Notification, NOTIFICATION_TYPE };