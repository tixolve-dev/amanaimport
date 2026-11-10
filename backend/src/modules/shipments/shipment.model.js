// backend/src/modules/shipments/shipment.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    stage: {
      type: String,
      enum: ['picked_up', 'departed_origin', 'in_transit', 'customs', 'arrived_destination', 'out_for_delivery', 'delivered', 'exception'],
      required: true,
    },
    description: { type: String, default: '', maxlength: 500 },
    location: { type: String, default: '', maxlength: 200 },
    occurredAt: { type: Date, required: true },
    evidenceKey: { type: String, default: null },
    evidenceUrl: { type: String, default: null },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    addedByRole: { type: String, required: true },
  },
  { _id: true },
);

const shipmentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    carrier: { type: String, default: '', maxlength: 200 },
    trackingNumber: { type: String, default: '', maxlength: 200, index: true },
    originCountry: { type: String, default: '', maxlength: 100 },
    destinationCity: { type: String, default: '', maxlength: 100 },
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: true },
);

const Shipment = mongoose.model('Shipment', shipmentSchema);
module.exports = { Shipment };