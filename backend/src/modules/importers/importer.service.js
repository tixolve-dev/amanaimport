// backend/src/modules/importers/importer.service.js
'use strict';

const mongoose = require('mongoose');
const { ImporterProfile, VERIFICATION_STATUS } = require('./importerProfile.model');
const { VerificationDocument } = require('./verificationDocument.model');
const { User } = require('../users/user.model');
const { Category } = require('../categories/category.model');
const { ROLES } = require('../../shared/constants/roles');
const { storage } = require('../uploads/storage.provider');
const ApiError = require('../../shared/utils/ApiError');
const auditService = require('../admin/auditLog.service');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

// ---------- Importer-facing ----------

async function getMyProfile(userId) {
  const profile = await ImporterProfile.findOne({ user: userId })
    .populate('supportedCategoryIds', 'name slug parentId');
  if (!profile) throw ApiError.notFound('Importer profile not found');
  const documents = await VerificationDocument.find({ importer: profile._id })
    .sort({ createdAt: -1 });
  return { profile, documents };
}

async function submitVerification(userId, payload) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role !== ROLES.IMPORTER) {
    throw ApiError.forbidden('Only importer accounts can submit verification');
  }

  // Validate supported categories exist
  if (payload.supportedCategoryIds && payload.supportedCategoryIds.length) {
    const count = await Category.countDocuments({
      _id: { $in: payload.supportedCategoryIds }, isActive: true,
    });
    if (count !== payload.supportedCategoryIds.length) {
      throw ApiError.badRequest('One or more supported categories are invalid or inactive');
    }
  }

  let profile = await ImporterProfile.findOne({ user: userId });
  if (!profile) {
    profile = new ImporterProfile({ user: userId, ...payload });
  } else {
    // Re-submission allowed after rejection or when adding info
    if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
      throw ApiError.conflict('Profile is already approved — cannot resubmit');
    }
    Object.assign(profile, payload);
    // Reset status to pending on any resubmission after rejection
    if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
      profile.verificationStatus = VERIFICATION_STATUS.PENDING;
      profile.rejectedAt = null;
      profile.verificationNotes = '';
    }
  }
  await profile.save();
  return profile;
}

async function addVerificationDocument(userId, payload) {
  const profile = await ImporterProfile.findOne({ user: userId });
  if (!profile) throw ApiError.notFound('Submit your profile first');

  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    throw ApiError.conflict('Cannot add documents to an approved profile');
  }

  if (!(await storage.exists(payload.fileKey))) {
    throw ApiError.badRequest('Uploaded file not found');
  }

  const doc = await VerificationDocument.create({ importer: profile._id, ...payload });
  return doc;
}

async function removeVerificationDocument(userId, documentId) {
  const profile = await ImporterProfile.findOne({ user: userId });
  if (!profile) throw ApiError.notFound('Profile not found');

  const doc = await VerificationDocument.findOne({
    _id: documentId, importer: profile._id,
  });
  if (!doc) throw ApiError.notFound('Document not found');
  if (doc.isApproved === true) {
    throw ApiError.conflict('Cannot delete an approved document');
  }

  await storage.delete(doc.fileKey);
  await VerificationDocument.deleteOne({ _id: doc._id });
  return { deleted: true };
}

// ---------- Public (safe data only) ----------

/**
 * Public importer summary for buyer-facing quotation cards.
 * No contact details, no documents, no internal IDs.
 */
async function publicSummary(importerProfileId) {
  const profile = await ImporterProfile.findById(importerProfileId)
    .select('businessName description yearEstablished serviceAreas ratingAverage ratingCount completedOrdersCount verificationStatus');
  if (!profile) throw ApiError.notFound('Importer not found');
  if (profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw ApiError.forbidden('Importer is not currently verified');
  }
  return {
    id: profile._id.toString(),
    businessName: profile.businessName,
    description: profile.description,
    yearEstablished: profile.yearEstablished,
    serviceAreas: profile.serviceAreas,
    ratingAverage: profile.ratingAverage,
    ratingCount: profile.ratingCount,
    completedOrdersCount: profile.completedOrdersCount,
  };
}

// ---------- Admin ----------

async function adminList({ verificationStatus, q }) {
  const filter = {};
  if (verificationStatus) filter.verificationStatus = verificationStatus;
  if (q && typeof q === 'string') filter.businessName = { $regex: q, $options: 'i' };
  const profiles = await ImporterProfile.find(filter)
    .sort({ createdAt: -1 })
    .populate('user', 'fullName email phone status');
  return profiles;
}

async function adminGetById(importerId) {
  const profile = await ImporterProfile.findById(importerId)
    .populate('user', 'fullName email phone status isEmailVerified isPhoneVerified')
    .populate('supportedCategoryIds', 'name slug');
  if (!profile) throw ApiError.notFound('Importer not found');
  const documents = await VerificationDocument.find({ importer: profile._id })
    .sort({ createdAt: -1 })
    .populate('reviewedBy', 'fullName email');
  return { profile, documents };
}

async function adminReview(adminId, importerId, { action, notes }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const profile = await ImporterProfile.findById(importerId).session(session);
      if (!profile) throw ApiError.notFound('Importer not found');

      const now = new Date();
      switch (action) {
        case 'approve':
          if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
            throw ApiError.conflict('Already approved');
          }
          profile.verificationStatus = VERIFICATION_STATUS.APPROVED;
          profile.verifiedAt = now;
          profile.verifiedBy = adminId;
          profile.rejectedAt = null;
          profile.suspendedAt = null;
          profile.verificationNotes = notes || '';
          break;
        case 'reject':
          if (profile.verificationStatus !== VERIFICATION_STATUS.PENDING) {
            throw ApiError.conflict('Only pending verifications can be rejected');
          }
          profile.verificationStatus = VERIFICATION_STATUS.REJECTED;
          profile.rejectedAt = now;
          profile.verificationNotes = notes || 'Rejected by admin';
          break;
        case 'suspend':
          if (profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
            throw ApiError.conflict('Only approved importers can be suspended');
          }
          profile.verificationStatus = VERIFICATION_STATUS.SUSPENDED;
          profile.suspendedAt = now;
          profile.verificationNotes = notes || 'Suspended by admin';
          break;
        case 'reinstate':
          if (profile.verificationStatus !== VERIFICATION_STATUS.SUSPENDED) {
            throw ApiError.conflict('Only suspended importers can be reinstated');
          }
          profile.verificationStatus = VERIFICATION_STATUS.APPROVED;
          profile.suspendedAt = null;
          profile.verifiedAt = now;
          profile.verifiedBy = adminId;
          profile.verificationNotes = notes || '';
          break;
        case 'expire':
          profile.verificationStatus = VERIFICATION_STATUS.EXPIRED;
          profile.verificationNotes = notes || 'Verification expired';
          break;
        default:
          throw ApiError.badRequest('Invalid action');
      }
const previousStatus = profile.verificationStatus;
      await profile.save({ session });

        await auditService.record({
        actorId: adminId,
        actorRole: ROLES.ADMIN,
        action: `importer.${action}`,
        targetType: 'ImporterProfile',
        targetId: profile._id,
        summary: `Verification action: ${action}`,
        before: { verificationStatus: previousStatus },
after: { verificationStatus: profile.verificationStatus, notes },
      });
      result = profile;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// ---------- Helper used elsewhere ----------

/**
 * True only if the importer's user is an importer AND profile is approved.
 * Used by quotation/request modules to gate actions.
 */
async function isApprovedImporter(userId) {
  const profile = await ImporterProfile.findOne({ user: userId })
    .select('verificationStatus');
  return Boolean(profile && profile.verificationStatus === VERIFICATION_STATUS.APPROVED);
}

module.exports = {
  getMyProfile,
  submitVerification,
  addVerificationDocument,
  removeVerificationDocument,
  publicSummary,
  adminList,
  adminGetById,
  adminReview,
  isApprovedImporter,
  parsePagination,
  buildPaginationMeta,
  VERIFICATION_STATUS,
};