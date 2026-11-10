// backend/src/modules/disputes/dispute.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const DISPUTE_STATUS = Object.freeze({
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED_BUYER_FAVOR: 'resolved_buyer_favor',
  RESOLVED_IMPORTER_FAVOR: 'resolved_importer_favor',
  RESOLVED_MUTUAL: 'resolved_mutual',
  WITHDRAWN: 'withdrawn',
});

const DISPUTE_REASON = Object.freeze({
  NON_DELIVERY: 'non_delivery',
  DAMAGED_GOODS: 'damaged_goods',
  INCORRECT_PRODUCT: 'incorrect_product',
  SPEC_MISMATCH: 'spec_mismatch',
  EXCESSIVE_DELAY: 'excessive_delay',
  UNAPPROVED_CHARGES: 'unapproved_charges',
  CANCELLATION: 'cancellation',
  PAYMENT_EVIDENCE: 'payment_evidence',
  OTHER: 'other',
});

const evidenceSchema = new Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, default: null },
    description: { type: String, default: '', maxlength: 500 },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    addedByRole: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const messageSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, required: true },
    body: { type: String, required: true, maxlength: 3000 },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const resolutionSchema = new Schema(
  {
    outcome: { type: String, enum: Object.values(DISPUTE_STATUS), required: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resolvedAt: { type: Date, required: true },
    notes: { type: String, default: '', maxlength: 2000 },
    // If refund: amount actually promised (does not imply actual transfer)
    refundPromisedETB: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const disputeSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    openedByRole: { type: String, enum: ['buyer', 'importer'], required: true },
    reason: { type: String, enum: Object.values(DISPUTE_REASON), required: true },
    description: { type: String, required: true, maxlength: 3000 },
    status: {
      type: String, enum: Object.values(DISPUTE_STATUS),
      default: DISPUTE_STATUS.OPEN, index: true,
    },
    evidence: { type: [evidenceSchema], default: [] },
    messages: { type: [messageSchema], default: [] },
    resolution: { type: resolutionSchema, default: null },
  },
  { timestamps: true },
);

disputeSchema.index({ order: 1, createdAt: -1 });
disputeSchema.index({ status: 1, createdAt: -1 });

const Dispute = mongoose.model('Dispute', disputeSchema);
module.exports = { Dispute, DISPUTE_STATUS, DISPUTE_REASON };