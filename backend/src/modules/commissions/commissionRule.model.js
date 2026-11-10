// backend/src/modules/commissions/commissionRule.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const FEE_TYPE = Object.freeze({
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
});

const PAYER = Object.freeze({
  BUYER: 'buyer',
  IMPORTER: 'importer',
});

const commissionRuleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    version: { type: String, required: true, unique: true, trim: true }, // e.g. "2026-01-01.v1"
    feeType: { type: String, enum: Object.values(FEE_TYPE), required: true },
    percentage: { type: Number, min: 0, max: 100, default: null }, // for PERCENTAGE
    fixedAmountETB: { type: Number, min: 0, default: null },        // for FIXED
    minFeeETB: { type: Number, min: 0, default: null },
    maxFeeETB: { type: Number, min: 0, default: null },
    payer: { type: String, enum: Object.values(PAYER), required: true },

    // Targeting — empty array means "all categories"
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category', index: true }],

    // Window of validity — must overlap the acceptance time
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveUntil: { type: Date, default: null, index: true },

    isActive: { type: Boolean, default: true, index: true },

    // Metadata
    description: { type: String, default: '', maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

// Prevent overlapping active percentage rules per exact category set is complex;
// we surface conflicts only on create via service layer.
commissionRuleSchema.index({ isActive: 1, effectiveFrom: -1 });

commissionRuleSchema.virtual('id').get(function id() { return this._id.toString(); });

const CommissionRule = mongoose.model('CommissionRule', commissionRuleSchema);
module.exports = { CommissionRule, FEE_TYPE, PAYER };