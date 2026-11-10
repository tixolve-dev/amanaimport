// backend/src/modules/importers/verificationDocument.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const DOC_TYPES = Object.freeze({
  BUSINESS_LICENSE: 'business_license',
  TIN_CERTIFICATE: 'tin_certificate',
  NATIONAL_ID: 'national_id',
  PASSPORT: 'passport',
  IMPORT_LICENSE: 'import_license',
  OTHER: 'other',
});

const verificationDocumentSchema = new Schema(
  {
    importer: {
      type: Schema.Types.ObjectId, ref: 'ImporterProfile',
      required: true, index: true,
    },
    type: { type: String, enum: Object.values(DOC_TYPES), required: true },
    label: { type: String, trim: true, default: '' },
    fileKey: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: '' },
    isApproved: { type: Boolean, default: null }, // null = not yet reviewed
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

verificationDocumentSchema.index({ importer: 1, type: 1 });
verificationDocumentSchema.virtual('id').get(function id() { return this._id.toString(); });

const VerificationDocument = mongoose.model('VerificationDocument', verificationDocumentSchema);
module.exports = { VerificationDocument, DOC_TYPES };