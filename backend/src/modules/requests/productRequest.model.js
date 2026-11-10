// backend/src/modules/requests/productRequest.model.js
'use strict';

const mongoose = require('mongoose');
const { REQUEST_STATUS } = require('./request.statuses');

const { Schema } = mongoose;

// Ethiopian delivery-city whitelist is open — admin-managed in future.
// Here we only enforce non-empty strings.

const attachmentSchema = new Schema(
  {
    key: { type: String, required: true },   // storage key (path-safe)
    url: { type: String, required: true },   // public URL
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ['reference_image', 'attachment'], required: true },
    originalName: { type: String, default: '' },
  },
  { _id: true },
);

const statusHistorySchema = new Schema(
  {
    from: { type: String, enum: Object.values(REQUEST_STATUS), default: null },
    to: { type: String, enum: Object.values(REQUEST_STATUS), required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const productRequestSchema = new Schema(
  {
    referenceNumber: {
      type: String, required: true, unique: true, index: true, uppercase: true, trim: true,
    },
    buyer: {
      type: Schema.Types.ObjectId, ref: 'User', required: true, index: true,
    },

    // --- Product details ---
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    subcategory: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    brand: { type: String, trim: true, default: '', maxlength: 100 },
    model: { type: String, trim: true, default: '', maxlength: 100 },
    referenceUrl: { type: String, trim: true, default: '', maxlength: 500 },
    specifications: { type: String, trim: true, default: '', maxlength: 3000 },

    // --- Quantity ---
    quantity: { type: Number, required: true, min: 1, max: 1_000_000 },
    unitOfMeasurement: { type: String, trim: true, default: 'piece', maxlength: 30 },

    // --- Budget (ETB). Both optional. If provided, max >= min. ---
    budgetMinETB: { type: Number, min: 0, default: null },
    budgetMaxETB: { type: Number, min: 0, default: null },

    // --- Delivery ---
    deliveryCity: { type: String, required: true, trim: true, maxlength: 100, index: true },
    deliveryAddress: { type: String, trim: true, default: '', maxlength: 500 },
    requiredDeliveryDate: { type: Date, default: null },

    // --- Quality ---
    warrantyRequired: { type: Boolean, default: false },
    warrantyDetails: { type: String, default: '', maxlength: 500 },
    qualityRequirements: { type: String, default: '', maxlength: 2000 },
    additionalInstructions: { type: String, default: '', maxlength: 2000 },

    // --- Attachments ---
    attachments: { type: [attachmentSchema], default: [] },

    // --- Lifecycle ---
    status: {
      type: String,
      enum: Object.values(REQUEST_STATUS),
      default: REQUEST_STATUS.DRAFT,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    publishedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: '', maxlength: 500 },

    // --- Offers ---
    quotationsCount: { type: Number, default: 0, min: 0 },
    acceptedQuotationId: {
      type: Schema.Types.ObjectId, ref: 'Quotation', default: null, index: true,
    },

    // --- Moderation ---
    isRestricted: { type: Boolean, default: false },
    adminNote: { type: String, default: '', maxlength: 1000 },
    rejectedByAdminAt: { type: Date, default: null },

    // --- History ---
    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes for importer discovery ---
productRequestSchema.index({ status: 1, category: 1, createdAt: -1 });
productRequestSchema.index({ status: 1, deliveryCity: 1, createdAt: -1 });
productRequestSchema.index({ status: 1, expiresAt: 1 });
productRequestSchema.index({ title: 'text', description: 'text', brand: 'text' });

productRequestSchema.virtual('id').get(function id() { return this._id.toString(); });

// Guard: budgetMax >= budgetMin when both set
productRequestSchema.pre('validate', function budgetCheck(next) {
  if (
    this.budgetMinETB != null && this.budgetMaxETB != null
    && this.budgetMaxETB < this.budgetMinETB
  ) {
    return next(new Error('budgetMaxETB must be greater than or equal to budgetMinETB'));
  }
  return next();
});

const ProductRequest = mongoose.model('ProductRequest', productRequestSchema);
module.exports = { ProductRequest };