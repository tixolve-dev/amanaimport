// backend/src/modules/reviews/review.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewee: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    importerProfile: {
      type: Schema.Types.ObjectId, ref: 'ImporterProfile', required: true, index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 1000 },
    // Optional sub-ratings
    communicationRating: { type: Number, min: 1, max: 5, default: null },
    deliveryRating: { type: Number, min: 1, max: 5, default: null },
    qualityRating: { type: Number, min: 1, max: 5, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

reviewSchema.index({ importerProfile: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);
module.exports = { Review };