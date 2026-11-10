// backend/src/modules/admin/fraudReport.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const FRAUD_STATUS = Object.freeze({
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  RESOLVED_NO_ACTION: 'resolved_no_action',
  RESOLVED_ACTION_TAKEN: 'resolved_action_taken',
});

const fraudReportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reporterRole: { type: String, default: null },
    category: {
      type: String,
      enum: [
        'suspected_fraud',
        'fake_importer',
        'counterfeit_product',
        'payment_scam',
        'off_platform_deal',
        'harassment',
        'other',
      ],
      required: true,
    },
    description: { type: String, required: true, maxlength: 3000 },
    relatedOrder: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    relatedUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    relatedRequest: { type: Schema.Types.ObjectId, ref: 'ProductRequest', default: null },
    evidence: {
      type: [{
        key: { type: String, required: true },
        url: { type: String, required: true },
        mimeType: { type: String, default: null },
      }],
      default: [],
    },
    status: {
      type: String, enum: Object.values(FRAUD_STATUS),
      default: FRAUD_STATUS.OPEN, index: true,
    },
    adminNotes: { type: String, default: '', maxlength: 2000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

fraudReportSchema.index({ status: 1, createdAt: -1 });

const FraudReport = mongoose.model('FraudReport', fraudReportSchema);
module.exports = { FraudReport, FRAUD_STATUS };