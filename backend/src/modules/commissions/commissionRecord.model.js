// backend/src/modules/commissions/commissionRecord.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const REVENUE_STATE = Object.freeze({
  PENDING: 'pending',      // order created, fee not yet due
  INVOICED: 'invoiced',    // admin issued invoice to payer
  RECEIVED: 'received',    // payment received and verified
  WAIVED: 'waived',
  REFUNDED: 'refunded',
});

const commissionRecordSchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true,
    },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    importerUser: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Snapshot of the rule used (do not reference live rule for accounting)
    ruleVersion: { type: String, required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'CommissionRule', required: true },
    feeType: { type: String, required: true },
    percentage: { type: Number, default: null },
    fixedAmountETB: { type: Number, default: null },
    payer: { type: String, required: true },

    // Computed amounts
    orderValueETB: { type: Number, required: true, min: 0 },
    computedFeeETB: { type: Number, required: true, min: 0 },

    revenueState: {
      type: String, enum: Object.values(REVENUE_STATE),
      default: REVENUE_STATE.PENDING, index: true,
    },
    invoicedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    waiverReason: { type: String, default: '', maxlength: 500 },
    refundReason: { type: String, default: '', maxlength: 500 },
    notes: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

commissionRecordSchema.index({ revenueState: 1, createdAt: -1 });

commissionRecordSchema.virtual('id').get(function id() { return this._id.toString(); });

const CommissionRecord = mongoose.model('CommissionRecord', commissionRecordSchema);
module.exports = { CommissionRecord, REVENUE_STATE };