// backend/src/modules/categories/category.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: {
      type: String, required: true, unique: true, lowercase: true, trim: true, index: true,
    },
    description: { type: String, default: '', maxlength: 500 },
    icon: { type: String, default: null }, // icon key or URL
    parentId: {
      type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    isRestricted: {
      type: Boolean, default: false,
      // when true only admin-approved requests may be published
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

categorySchema.index({ parentId: 1, sortOrder: 1 });
categorySchema.index({ name: 'text', description: 'text' });

categorySchema.virtual('id').get(function id() { return this._id.toString(); });

const Category = mongoose.model('Category', categorySchema);
module.exports = { Category };