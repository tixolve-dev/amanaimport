// backend/src/modules/payments/paymentRecord.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const PAYMENT_STATUS = Object.freeze({
  SUBMITTED: 'submitted',   // buyer submitted evidence, awaiting admin review
  VERIFIED: 'verified',     // admin confirmed — order can proceed
  REJECTED: 'rejected',     // admin rejected — buyer must resubmit
  REVERSED: 'reversed',     // later reversal (refund / chargeback)
  DISPUTED: 'disputed',     // under dispute
});

const reviewActionSchema = new Schema(
  {
    action: { type: String, enum: ['submitted', 'verified', 'rejected', 'reversed', 'disputed'], required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },
    note: { type: String, default: '', maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const paymentRecordSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // What the buyer claims
    transactionReference: {
      type: String, required: true, trim: true, maxlength: 120, index: true,
    },
    amountETB: { type: Number, required: true, min: 0 },
    paymentChannel: {
      type: String, required: true,
      enum: ['bank_transfer', 'telebirr', 'cbe_birr', 'awash_birr', 'other'],
    },
    paidAt: { type: Date, required: true },
    // Evidence
    receiptKey: { type: String, default: null },
    receiptUrl: { type: String, default: null },
    receiptMimeType: { type: String, default: null },
    receiptProvider: { type: String, enum: ['storage', 'cloudinary'], default: 'storage' },
    receiptDeliveryType: { type: String, enum: ['upload', 'authenticated'], default: 'upload' },

    // Review trail
    status: {
      type: String, enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.SUBMITTED, index: true,
    },
    reviewHistory: { type: [reviewActionSchema], default: [] },

    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', maxlength: 1000 },

    // Never auto-trusted
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

// Prevent duplicate transaction reference unless rejected (buyer can retry)
paymentRecordSchema.index(
  { transactionReference: 1, status: 1 },
  {
    name: 'uniq_txnref_active',
    unique: true,
    partialFilterExpression: {
      status: { $in: ['submitted', 'verified'] },
    },
  },
);

paymentRecordSchema.index({ status: 1, createdAt: -1 });

paymentRecordSchema.virtual('id').get(function id() { return this._id.toString(); });

// Guard: verifiedAt must be set when status is verified
paymentRecordSchema.pre('save', function verifyGuard(next) {
  if (this.status === PAYMENT_STATUS.VERIFIED) {
    this.isVerified = true;
    if (!this.reviewedAt) this.reviewedAt = new Date();
  } else {
    this.isVerified = false;
  }
  next();
});

const PaymentRecord = mongoose.model('PaymentRecord', paymentRecordSchema);
module.exports = { PaymentRecord, PAYMENT_STATUS };