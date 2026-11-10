// backend/src/modules/quotations/quotation.model.js
'use strict';

const mongoose = require('mongoose');
const { QUOTATION_STATUS } = require('./quotation.statuses');

const { Schema } = mongoose;

const itemizedCostSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    amountETB: { type: Number, required: true, min: 0 },
    note: { type: String, default: '', maxlength: 300 },
  },
  { _id: true },
);

// Frozen at acceptance — never mutated afterwards
const snapshotSchema = new Schema(
  {
    totalPriceETB: { type: Number, required: true, min: 0 },
    itemizedCosts: { type: [itemizedCostSchema], default: [] },
    productCondition: { type: String, required: true },
    specifications: { type: String, default: '' },
    warrantyOffered: { type: String, default: '' },
    returnPolicy: { type: String, default: '' },
    estimatedDeliveryDays: { type: Number, required: true, min: 1 },
    quotationValidUntil: { type: Date, required: true },
    isEstimateFinal: { type: Boolean, default: false },
    exclusions: { type: String, default: '' },
    // Terms snapshot of the request at acceptance time
    requestSnapshot: {
      referenceNumber: { type: String, required: true },
      title: { type: String, required: true },
      quantity: { type: Number, required: true },
      unitOfMeasurement: { type: String, default: 'piece' },
      deliveryCity: { type: String, required: true },
      deliveryAddress: { type: String, default: '' },
      categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    },
    // Importer profile snapshot (businessName needed for order, contact revealed post-accept)
    importerSnapshot: {
      importerProfileId: { type: Schema.Types.ObjectId, ref: 'ImporterProfile', required: true },
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      businessName: { type: String, required: true },
      contactPhone: { type: String, default: null },
      contactEmail: { type: String, default: null },
    },
    acceptedAt: { type: Date, required: true },
  },
  { _id: false },
);

const quotationSchema = new Schema(
  {
    referenceNumber: {
      type: String, required: true, unique: true, index: true, uppercase: true, trim: true,
    },
    request: {
      type: Schema.Types.ObjectId, ref: 'ProductRequest', required: true, index: true,
    },
    importerProfile: {
      type: Schema.Types.ObjectId, ref: 'ImporterProfile', required: true, index: true,
    },
    importerUser: {
      type: Schema.Types.ObjectId, ref: 'User', required: true, index: true,
    },

    // --- Pricing (all in ETB) ---
    totalPriceETB: { type: Number, required: true, min: 0 },
    itemizedCosts: { type: [itemizedCostSchema], default: [] },
    isEstimateFinal: { type: Boolean, default: false },
    exclusions: { type: String, default: '', maxlength: 1000 },

    // --- Product ---
    productCondition: {
      type: String, required: true,
      enum: ['new', 'used_like_new', 'used_good', 'used_fair', 'refurbished'],
    },
    specifications: { type: String, default: '', maxlength: 3000 },
    warrantyOffered: { type: String, default: '', maxlength: 500 },
    returnPolicy: { type: String, default: '', maxlength: 1000 },

    // --- Delivery ---
    estimatedDeliveryDays: { type: Number, required: true, min: 1, max: 365 },
    quotationValidUntil: { type: Date, required: true, index: true },

    // --- Free-form ---
    notes: { type: String, default: '', maxlength: 2000 },
    attachments: {
      type: [{
        key: { type: String, required: true },
        url: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        originalName: { type: String, default: '' },
      }],
      default: [],
    },

    // --- Lifecycle ---
    status: {
      type: String, enum: Object.values(QUOTATION_STATUS),
      default: QUOTATION_STATUS.SUBMITTED, index: true,
    },
    withdrawnAt: { type: Date, default: null },
    withdrawalReason: { type: String, default: '', maxlength: 500 },
    acceptedAt: { type: Date, default: null },
    snapshot: { type: snapshotSchema, default: null },

    // --- Order linkage (set when accepted) ---
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

// One importer → one quotation per request
quotationSchema.index(
  { request: 1, importerProfile: 1 },
  { unique: true, name: 'uniq_request_importer' },
);
// Discovery: my quotations
quotationSchema.index({ importerUser: 1, createdAt: -1 });
// Buyer view: quotations for a request
quotationSchema.index({ request: 1, createdAt: -1 });

quotationSchema.virtual('id').get(function id() { return this._id.toString(); });

const Quotation = mongoose.model('Quotation', quotationSchema);
module.exports = { Quotation };