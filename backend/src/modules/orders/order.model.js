// backend/src/modules/orders/order.model.js
'use strict';

const mongoose = require('mongoose');
const { ORDER_STATUS } = require('./order.statuses');

const { Schema } = mongoose;

const itemizedCostSnapshotSchema = new Schema(
  {
    label: { type: String, required: true },
    amountETB: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const orderStatusHistorySchema = new Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    referenceNumber: {
      type: String, required: true, unique: true, index: true, uppercase: true, trim: true,
    },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    importerUser: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    importerProfile: {
      type: Schema.Types.ObjectId, ref: 'ImporterProfile', required: true, index: true,
    },
    request: { type: Schema.Types.ObjectId, ref: 'ProductRequest', required: true, index: true },
    quotation: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true, index: true },

    // Immutable snapshot of agreed terms (source of truth for the order)
    snapshot: {
      requestReferenceNumber: { type: String, required: true },
      quotationReferenceNumber: { type: String, required: true },
      title: { type: String, required: true },
      imageUrl: { type: String, default: null },
      quantity: { type: Number, required: true },
      unitOfMeasurement: { type: String, default: 'piece' },
      deliveryCity: { type: String, required: true },
      deliveryAddress: { type: String, default: '' },
      productCondition: { type: String, required: true },
      specifications: { type: String, default: '' },
      warrantyOffered: { type: String, default: '' },
      returnPolicy: { type: String, default: '' },
      estimatedDeliveryDays: { type: Number, required: true },
      isEstimateFinal: { type: Boolean, default: false },
      exclusions: { type: String, default: '' },
      itemizedCosts: { type: [itemizedCostSnapshotSchema], default: [] },
      importerBusinessName: { type: String, required: true },
    },

    // Financial
    totalPriceETB: { type: Number, required: true, min: 0 },
    platformFeeETB: { type: Number, default: 0, min: 0 },
    platformFeePayer: { type: String, enum: ['buyer', 'importer'], default: 'buyer' },
    // Snapshot of the commission rule that was in effect at order creation
    commissionRuleVersion: { type: String, default: null },

    status: {
      type: String, enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.AWAITING_PAYMENT, index: true,
    },
    statusHistory: { type: [orderStatusHistorySchema], default: [] },

    acceptedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ importerUser: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

orderSchema.virtual('id').get(function id() { return this._id.toString(); });

const Order = mongoose.model('Order', orderSchema);
module.exports = { Order };