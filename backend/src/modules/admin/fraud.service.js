// backend/src/modules/admin/fraud.service.js
'use strict';

const { FraudReport, FRAUD_STATUS } = require('./fraudReport.model');
const auditService = require('./auditLog.service');
const { ROLES } = require('../../shared/constants/roles');
const ApiError = require('../../shared/utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

async function submitReport({ userId = null, userRole = null, payload }) {
  const report = await FraudReport.create({
    reporter: userId,
    reporterRole: userRole,
    category: payload.category,
    description: payload.description,
    relatedOrder: payload.relatedOrder || null,
    relatedUser: payload.relatedUser || null,
    relatedRequest: payload.relatedRequest || null,
    evidence: payload.evidence || [],
  });
  return report;
}

async function adminList(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  const [items, total] = await Promise.all([
    FraudReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('reporter', 'fullName email role')
      .populate('relatedUser', 'fullName email role'),
    FraudReport.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

async function adminGet(id) {
  const doc = await FraudReport.findById(id)
    .populate('reporter', 'fullName email role')
    .populate('relatedUser', 'fullName email role')
    .populate('relatedOrder', 'referenceNumber status')
    .populate('relatedRequest', 'referenceNumber title status');
  if (!doc) throw ApiError.notFound('Fraud report not found');
  return doc;
}

async function adminUpdateStatus(adminId, id, { status, notes }) {
  const doc = await FraudReport.findById(id);
  if (!doc) throw ApiError.notFound('Fraud report not found');
  if (!Object.values(FRAUD_STATUS).includes(status)) {
    throw ApiError.badRequest('Invalid fraud report status');
  }
  doc.status = status;
  doc.reviewedBy = adminId;
  doc.reviewedAt = new Date();
  if (notes !== undefined) doc.adminNotes = notes;
  await doc.save();

  await auditService.record({
    actorId: adminId,
    actorRole: ROLES.ADMIN,
    action: `fraud.${status}`,
    targetType: 'FraudReport',
    targetId: doc._id,
    summary: `Fraud report → ${status}`,
    after: { status, notes },
  });
  return doc;
}

module.exports = { submitReport, adminList, adminGet, adminUpdateStatus, FRAUD_STATUS };