// backend/src/modules/importers/importerProfile.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const VERIFICATION_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
});

const importerProfileSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true,
    },
    businessName: { type: String, required: true, trim: true, maxlength: 150 },
    businessType: {
      type: String, enum: ['individual', 'company', 'partnership'], default: 'individual',
    },
    tinNumber: { type: String, trim: true, default: null }, // Tax ID
    businessLicenseNumber: { type: String, trim: true, default: null },
    licenseExpiryDate: { type: Date, default: null },

    description: { type: String, default: '', maxlength: 1000 },
    yearEstablished: { type: Number, min: 1900, max: new Date().getFullYear(), default: null },

    contactEmail: { type: String, trim: true, lowercase: true, default: null },
    contactPhone: { type: String, trim: true, default: null },
    websiteUrl: { type: String, trim: true, default: null },

    officeAddress: {
      city: { type: String, trim: true, default: null },
      subcity: { type: String, trim: true, default: null },
      woreda: { type: String, trim: true, default: null },
      line1: { type: String, trim: true, default: null },
    },

    serviceAreas: [{ type: String, trim: true }], // ["Addis Ababa", "Adama", ...]
    supportedCategoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],

    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
      index: true,
    },
    verificationNotes: { type: String, default: '' }, // admin reason on reject/suspend
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },

    // Public rating snapshot (updated by reviews module in later phase)
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    completedOrdersCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

importerProfileSchema.index({ verificationStatus: 1, createdAt: -1 });
importerProfileSchema.index({ serviceAreas: 1 });
importerProfileSchema.index({ supportedCategoryIds: 1 });

importerProfileSchema.virtual('id').get(function id() { return this._id.toString(); });

const ImporterProfile = mongoose.model('ImporterProfile', importerProfileSchema);
module.exports = { ImporterProfile, VERIFICATION_STATUS };