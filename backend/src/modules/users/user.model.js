// backend/src/modules/users/user.model.js
'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, ALL_ROLES } = require('../../shared/constants/roles');
const { USER_STATUS, BUYER_TYPE } = require('../../shared/constants/statuses');

const { Schema } = mongoose;

// Ethiopian phone: +251 9xxxxxxxx, +251 7xxxxxxxx, or 09xxxxxxxx / 07xxxxxxxx
const ETHIOPIAN_PHONE_REGEX = /^(\+251|0)(9|7)\d{8}$/;

const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { _id: true },
);

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name too short'],
      maxlength: [120, 'Full name too long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      validate: {
        validator: (v) => ETHIOPIAN_PHONE_REGEX.test(v),
        message: 'Phone must be a valid Ethiopian number (+251 9/7xxxxxxxx or 09/07xxxxxxxx)',
      },
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    buyerType: {
      type: String,
      enum: Object.values(BUYER_TYPE),
      default: null,
    },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    preferredLanguage: {
      type: String,
      enum: ['en', 'am'],
      default: 'en',
    },
    // Password reset (never returned by default)
    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetExpiresAt: { type: Date, select: false, default: null },
    // Refresh-token store (rotation — max 5 active sessions)
    refreshTokens: {
      type: [refreshTokenSchema],
      select: false,
      default: [],
    },
    lastLoginAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.refreshTokens;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound index for admin filtering
userSchema.index({ role: 1, status: 1, createdAt: -1 });

// ---- Instance methods -----------------------------------------------------

userSchema.methods.setPassword = async function setPassword(plain) {
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(plain, salt);
};

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isActive = function isActive() {
  return this.status === USER_STATUS.ACTIVE && !this.deletedAt;
};

// Virtuals
userSchema.virtual('id').get(function id() {
  return this._id.toString();
});

const User = mongoose.model('User', userSchema);

module.exports = { User, ROLES, USER_STATUS, BUYER_TYPE, ETHIOPIAN_PHONE_REGEX };