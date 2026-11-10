// backend/src/modules/admin/legalChecklist.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * This is a legal REVIEW TRACKING document, not a compliance claim.
 * Prompt §12 requires us to distinguish product functionality from legal
 * approval and to record which capabilities remain disabled until approved.
 */
const legalChecklistSchema = new Schema(
  {
    item: { type: String, required: true, unique: true }, // stable key
    label: { type: String, required: true },
    category: {
      type: String,
      enum: ['business_registration', 'ecommerce', 'imports', 'forex',
        'customs_tax', 'payment_licensing', 'consumer', 'data_protection',
        'records_accounting', 'commissions_tax'],
      required: true,
    },
    status: {
      type: String,
      enum: ['not_started', 'in_review', 'advice_obtained', 'enabled'],
      default: 'not_started', index: true,
    },
    // Feature gate controlled by this item
    gatesCapability: { type: String, default: null, index: true },
    notes: { type: String, default: '', maxlength: 2000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    legalAdviceReference: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true },
);

const LegalChecklistItem = mongoose.model('LegalChecklistItem', legalChecklistSchema);
module.exports = { LegalChecklistItem };