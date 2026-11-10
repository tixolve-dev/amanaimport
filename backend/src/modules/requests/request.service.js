// backend/src/modules/requests/request.service.js
'use strict';

const mongoose = require('mongoose');
const { ProductRequest } = require('./productRequest.model');
const { Category } = require('../categories/category.model');
const { ImporterProfile, VERIFICATION_STATUS } = require('../importers/importerProfile.model');
const { User } = require('../users/user.model');
const { REQUEST_STATUS, canTransition } = require('./request.statuses');
const { ROLES } = require('../../shared/constants/roles');
const { generateRequestRef } = require('../../shared/utils/referenceNumber');
const ApiError = require('../../shared/utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

// ---------- Helpers ----------

function assertOwnership(request, userId) {
  if (request.buyer.toString() !== userId.toString()) {
    throw ApiError.forbidden('You do not have access to this request', {
      code: 'NOT_OWNER',
    });
  }
}

function pushHistory(request, to, actorId, actorRole, note = '') {
  const from = request.status;
  request.statusHistory.push({ from, to, actor: actorId, actorRole, note });
  request.status = to;
}

async function findCategoryOrFail(id) {
  const cat = await Category.findById(id);
  if (!cat || !cat.isActive) {
    throw ApiError.badRequest('Category does not exist or is inactive', {
      code: 'INVALID_CATEGORY',
    });
  }
  return cat;
}

/**
 * Build a projection that strips buyer PII for importer-facing responses.
 * The importer sees `deliveryCity` (needed to quote) but not `deliveryAddress`
 * and never sees the buyer's user record.
 */
const IMPORTER_SAFE_PROJECTION = {
  referenceNumber: 1,
  title: 1,
  description: 1,
  category: 1,
  subcategory: 1,
  brand: 1,
  model: 1,
  referenceUrl: 1,
  specifications: 1,
  quantity: 1,
  unitOfMeasurement: 1,
  budgetMinETB: 1,
  budgetMaxETB: 1,
  deliveryCity: 1,
  requiredDeliveryDate: 1,
  warrantyRequired: 1,
  warrantyDetails: 1,
  qualityRequirements: 1,
  additionalInstructions: 1,
  attachments: 1,
  status: 1,
  expiresAt: 1,
  publishedAt: 1,
  quotationsCount: 1,
  createdAt: 1,
  // explicitly EXCLUDED: buyer, deliveryAddress, adminNote, statusHistory, cancellation*
};

// ---------- Buyer: CRUD ----------

async function createRequest(userId, payload) {
  await findCategoryOrFail(payload.category);
  if (payload.subcategory) {
    const sub = await Category.findById(payload.subcategory);
    if (!sub || !sub.isActive) throw ApiError.badRequest('Subcategory invalid');
    if (sub.parentId && sub.parentId.toString() !== payload.category.toString()) {
      throw ApiError.badRequest('Subcategory does not belong to the chosen category');
    }
  }

  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw ApiError.badRequest('expiresAt is invalid');
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('expiresAt must be in the future');
  }

  const category = await Category.findById(payload.category);
  const doc = new ProductRequest({
    ...payload,
    expiresAt,
    buyer: userId,
    referenceNumber: generateRequestRef(),
    isRestricted: Boolean(category?.isRestricted),
    status: REQUEST_STATUS.DRAFT,
    statusHistory: [{
      from: null, to: REQUEST_STATUS.DRAFT, actor: userId, actorRole: ROLES.BUYER,
    }],
  });

  await doc.save();
  return doc;
}

async function updateRequest(userId, requestId, patch) {
  const doc = await ProductRequest.findById(requestId);
  if (!doc) throw ApiError.notFound('Request not found');
  assertOwnership(doc, userId);

  if (![REQUEST_STATUS.DRAFT, REQUEST_STATUS.PUBLISHED, REQUEST_STATUS.RECEIVING_OFFERS]
    .includes(doc.status)) {
    throw ApiError.conflict(`Cannot edit a request in "${doc.status}" state`, {
      code: 'INVALID_STATE',
    });
  }

  if (patch.category) await findCategoryOrFail(patch.category);

  // Whitelist updatable fields — never trust raw body
  const ALLOWED = [
    'title', 'description', 'category', 'subcategory', 'brand', 'model',
    'referenceUrl', 'specifications', 'quantity', 'unitOfMeasurement',
    'budgetMinETB', 'budgetMaxETB', 'deliveryCity', 'deliveryAddress',
    'requiredDeliveryDate', 'warrantyRequired', 'warrantyDetails',
    'qualityRequirements', 'additionalInstructions', 'expiresAt', 'attachments',
  ];
  for (const key of ALLOWED) {
    if (patch[key] !== undefined) {
      if (key === 'expiresAt') {
        const d = new Date(patch[key]);
        if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
          throw ApiError.badRequest('expiresAt must be a future date');
        }
        doc.expiresAt = d;
      } else {
        doc[key] = patch[key];
      }
    }
  }

  // Guard budget constraint after mutation
  if (
    doc.budgetMinETB != null && doc.budgetMaxETB != null
    && doc.budgetMaxETB < doc.budgetMinETB
  ) {
    throw ApiError.badRequest('budgetMaxETB must be >= budgetMinETB');
  }

  await doc.save();
  return doc;
}

async function publishRequest(userId, requestId) {
  const doc = await ProductRequest.findById(requestId);
  if (!doc) throw ApiError.notFound('Request not found');
  assertOwnership(doc, userId);

  if (doc.status !== REQUEST_STATUS.DRAFT) {
    throw ApiError.conflict('Only draft requests can be published', {
      code: 'INVALID_STATE',
    });
  }
  if (doc.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('Cannot publish an already-expired request');
  }

  pushHistory(doc, REQUEST_STATUS.PUBLISHED, userId, ROLES.BUYER);
  doc.publishedAt = new Date();
  await doc.save();
  return doc;
}

async function cancelRequest(userId, requestId, reason = '') {
  const doc = await ProductRequest.findById(requestId);
  if (!doc) throw ApiError.notFound('Request not found');
  assertOwnership(doc, userId);

  // Cancellable states
  const cancellable = [
    REQUEST_STATUS.DRAFT, REQUEST_STATUS.PUBLISHED, REQUEST_STATUS.RECEIVING_OFFERS,
  ];
  if (!cancellable.includes(doc.status)) {
    throw ApiError.conflict(`Cannot cancel a request in "${doc.status}" state`);
  }

  if (!canTransition(doc.status, REQUEST_STATUS.CANCELLED)) {
    throw ApiError.conflict('Cancellation not allowed from current state');
  }

  pushHistory(doc, REQUEST_STATUS.CANCELLED, userId, ROLES.BUYER, reason);
  doc.cancelledAt = new Date();
  doc.cancellationReason = reason;
  await doc.save();
  return doc;
}

async function getMyRequest(userId, requestId) {
  const doc = await ProductRequest.findById(requestId)
    .populate('category', 'name slug')
    .populate('subcategory', 'name slug');
  if (!doc) throw ApiError.notFound('Request not found');
  assertOwnership(doc, userId);
  return doc;
}

async function listMyRequests(userId, query) {
  const { page, limit, skip, sort } = parsePagination(query);
  const filter = { buyer: userId };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    ProductRequest.find(filter)
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('category', 'name slug'),
    ProductRequest.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

// ---------- Importer discovery ----------

async function assertApprovedImporter(userId) {
  const profile = await ImporterProfile.findOne({ user: userId }).select('verificationStatus');
  if (!profile || profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw ApiError.forbidden(
      'Only approved importers can browse requests',
      { code: 'IMPORTER_NOT_APPROVED' },
    );
  }
  return profile;
}

async function discoverRequests(userId, query) {
  await assertApprovedImporter(userId);

  // Only show requests currently accepting offers, not expired
  const filter = {
    status: { $in: [REQUEST_STATUS.PUBLISHED, REQUEST_STATUS.RECEIVING_OFFERS] },
    expiresAt: { $gt: new Date() },
    isRestricted: false, // restricted categories hidden from public discovery
  };
  if (query.category) filter.category = query.category;
  if (query.city) filter.deliveryCity = query.city;
  if (query.budgetMin != null) {
    filter.budgetMaxETB = { $gte: query.budgetMin };
  }
  if (query.budgetMax != null) {
    filter.budgetMinETB = { ...(filter.budgetMinETB || {}), $lte: query.budgetMax };
  }
  if (query.q) {
    filter.$text = { $search: query.q };
  }

  let sortSpec = { createdAt: -1 };
  if (query.sort === 'oldest') sortSpec = { createdAt: 1 };
  if (query.sort === 'expiring_soon') sortSpec = { expiresAt: 1 };
  if (query.sort === 'highest_budget') sortSpec = { budgetMaxETB: -1 };

  const { page, limit, skip } = parsePagination(query);
  const [items, total] = await Promise.all([
    ProductRequest.find(filter, IMPORTER_SAFE_PROJECTION)
      .sort(sortSpec).skip(skip).limit(limit)
      .populate('category', 'name slug'),
    ProductRequest.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

async function discoverRequestDetail(userId, requestId) {
  await assertApprovedImporter(userId);
  const doc = await ProductRequest.findOne(
    {
      _id: requestId,
      status: { $in: [REQUEST_STATUS.PUBLISHED, REQUEST_STATUS.RECEIVING_OFFERS] },
      expiresAt: { $gt: new Date() },
      isRestricted: false,
    },
    IMPORTER_SAFE_PROJECTION,
  ).populate('category', 'name slug').populate('subcategory', 'name slug');

  if (!doc) {
    throw ApiError.notFound('Request not found or no longer accepting offers');
  }
  return doc;
}

// ---------- System transitions (used elsewhere) ----------

/**
 * Transition a request when a quotation is accepted. Called from the
 * quotations module (Phase 1.5). Kept here so state machine stays in one place.
 */
async function markOfferSelected(requestId, quotationId, session) {
  const doc = await ProductRequest.findById(requestId).session(session || null);
  if (!doc) throw ApiError.notFound('Request not found');
  if (doc.status !== REQUEST_STATUS.RECEIVING_OFFERS
    && doc.status !== REQUEST_STATUS.PUBLISHED) {
    throw ApiError.conflict(`Cannot select offer from state "${doc.status}"`, {
      code: 'INVALID_STATE',
    });
  }
  if (doc.acceptedQuotationId) {
    throw ApiError.conflict('A quotation has already been accepted for this request', {
      code: 'ALREADY_ACCEPTED',
    });
  }
  doc.statusHistory.push({
    from: doc.status,
    to: REQUEST_STATUS.OFFER_SELECTED,
    actor: null,
    actorRole: 'system',
    note: `Quotation ${quotationId} accepted`,
  });
  doc.status = REQUEST_STATUS.OFFER_SELECTED;
  doc.acceptedQuotationId = quotationId;
  await doc.save({ session });
  return doc;
}

/**
 * Expire a request (cron or admin). Idempotent.
 */
async function expireIfPast(requestId, session) {
  const doc = await ProductRequest.findById(requestId).session(session || null);
  if (!doc) return null;
  if (![REQUEST_STATUS.PUBLISHED, REQUEST_STATUS.RECEIVING_OFFERS].includes(doc.status)) {
    return doc;
  }
  if (doc.expiresAt.getTime() > Date.now()) return doc;
  doc.statusHistory.push({
    from: doc.status, to: REQUEST_STATUS.EXPIRED, actor: null, actorRole: 'system',
  });
  doc.status = REQUEST_STATUS.EXPIRED;
  await doc.save({ session });
  return doc;
}

/**
 * Bumps quotation count. Called from quotations module after creation.
 */
async function incrementQuotationsCount(requestId, delta = 1, session) {
  await ProductRequest.updateOne(
    { _id: requestId },
    { $inc: { quotationsCount: delta } },
    { session: session || undefined },
  );
}

/**
 * Admin oversight: list all requests with filters + pagination.
 * Unlike `/requests/me`, this is not scoped to a specific buyer.
 */
async function adminListRequests(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.city) filter.deliveryCity = query.city;
  if (query.buyerId) filter.buyer = query.buyerId;
  if (query.q && typeof query.q === 'string') {
    filter.title = { $regex: query.q, $options: 'i' };
  }

  const [items, total] = await Promise.all([
    ProductRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('category', 'name slug')
      .populate('buyer', 'fullName email phone'),
    ProductRequest.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

/**
 * Admin oversight: read-only full request detail.
 * Admin sees everything including buyer contact and status history.
 */
async function adminGetRequest(requestId) {
  const doc = await ProductRequest.findById(requestId)
    .populate('category', 'name slug')
    .populate('subcategory', 'name slug')
    .populate('buyer', 'fullName email phone status');
  if (!doc) throw ApiError.notFound('Request not found');
  return doc;
}

module.exports = {
  createRequest,
  updateRequest,
  publishRequest,
  cancelRequest,
  getMyRequest,
  listMyRequests,
  discoverRequests,
  discoverRequestDetail,
  assertApprovedImporter,
  markOfferSelected,
  expireIfPast,
  incrementQuotationsCount,
  adminListRequests,
  adminGetRequest,
  IMPORTER_SAFE_PROJECTION,
  REQUEST_STATUS,
};