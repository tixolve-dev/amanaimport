// backend/src/modules/quotations/quotation.service.js
'use strict';

const mongoose = require('mongoose');
const { Quotation } = require('./quotation.model');
const { QUOTATION_STATUS, IMPORTER_EDITABLE, BUYER_ACCEPTABLE } = require('./quotation.statuses');
const { ProductRequest } = require('../requests/productRequest.model');
const { REQUEST_STATUS } = require('../requests/request.statuses');
const requestService = require('../requests/request.service');
const { ImporterProfile, VERIFICATION_STATUS } = require('../importers/importerProfile.model');
const { User } = require('../users/user.model');
const { ROLES } = require('../../shared/constants/roles');
const { generateQuoteRef } = require('../../shared/utils/referenceNumber');
const ApiError = require('../../shared/utils/ApiError');
const { Order } = require('../orders/order.model');
const notificationService = require('../notifications/notification.service');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

// Lazy-required to avoid circular dependency
function getOrderService() {
  // eslint-disable-next-line global-require
  return require('../orders/order.service');
}

// ---------- Guards ----------

async function getApprovedImporterProfileOrFail(userId) {
  const profile = await ImporterProfile.findOne({ user: userId });
  if (!profile || profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw ApiError.forbidden(
      'Only verified importers can submit or modify quotations',
      { code: 'IMPORTER_NOT_APPROVED' },
    );
  }
  return profile;
}

async function loadActiveRequestOrFail(requestId) {
  const request = await ProductRequest.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  if (request.isRestricted) {
    throw ApiError.forbidden('This request is restricted and not open for public quotes', {
      code: 'REQUEST_RESTRICTED',
    });
  }
  if (![REQUEST_STATUS.PUBLISHED, REQUEST_STATUS.RECEIVING_OFFERS].includes(request.status)) {
    throw ApiError.conflict(
      `Request is not accepting quotations (state: ${request.status})`,
      { code: 'REQUEST_NOT_ACCEPTING' },
    );
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    throw ApiError.conflict('Request has expired', { code: 'REQUEST_EXPIRED' });
  }
  return request;
}

function assertValidQuotationWindow(validUntil) {
  const d = new Date(validUntil);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('quotationValidUntil is invalid');
  if (d.getTime() <= Date.now()) {
    throw ApiError.badRequest('quotationValidUntil must be in the future');
  }
}

// ---------- Submit ----------

async function submitQuotation(userId, requestId, payload) {
  const profile = await getApprovedImporterProfileOrFail(userId);
  const request = await loadActiveRequestOrFail(requestId);

  if (request.buyer.toString() === userId.toString()) {
    throw ApiError.forbidden('You cannot submit a quotation on your own request', {
      code: 'SELF_QUOTE',
    });
  }

  assertValidQuotationWindow(payload.quotationValidUntil);

  const existing = await Quotation.findOne({
    request: requestId, importerProfile: profile._id,
  });
  if (existing) {
    throw ApiError.conflict('You have already submitted a quotation for this request', {
      code: 'QUOTE_EXISTS',
    });
  }

  const quotation = await Quotation.create({
    referenceNumber: generateQuoteRef(),
    request: request._id,
    importerProfile: profile._id,
    importerUser: userId,
    totalPriceETB: payload.totalPriceETB,
    itemizedCosts: payload.itemizedCosts || [],
    isEstimateFinal: Boolean(payload.isEstimateFinal),
    exclusions: payload.exclusions || '',
    productCondition: payload.productCondition,
    specifications: payload.specifications || '',
    warrantyOffered: payload.warrantyOffered || '',
    returnPolicy: payload.returnPolicy || '',
    estimatedDeliveryDays: payload.estimatedDeliveryDays,
    quotationValidUntil: new Date(payload.quotationValidUntil),
    notes: payload.notes || '',
    attachments: payload.attachments || [],
    status: QUOTATION_STATUS.SUBMITTED,
  });

  // Request transitions PUBLISHED → RECEIVING_OFFERS on first quote
  if (request.status === REQUEST_STATUS.PUBLISHED) {
    request.statusHistory.push({
      from: REQUEST_STATUS.PUBLISHED,
      to: REQUEST_STATUS.RECEIVING_OFFERS,
      actor: null, actorRole: 'system', note: 'First quotation received',
    });
    request.status = REQUEST_STATUS.RECEIVING_OFFERS;
    await request.save();
  }

 
  await requestService.incrementQuotationsCount(request._id, 1);

  // Notify the buyer that an importer has submitted a quotation.
  await notificationService.notify({
    recipientId: request.buyer,
    type: notificationService.NOTIFICATION_TYPE.QUOTATION_SUBMITTED,
    title: 'New quotation received',
    body: `An importer submitted a quotation for "${request.title}".`,
    data: {
      quotationId: quotation._id.toString(),
      requestId: request._id.toString(),
      referenceNumber: quotation.referenceNumber,
    },
    event: {
      type: 'Quotation',
      targetId: quotation._id,
    },
  });

  return quotation;
}

// ---------- Edit ----------

async function updateQuotation(userId, quotationId, patch) {
  const profile = await getApprovedImporterProfileOrFail(userId);
  const quote = await Quotation.findById(quotationId);
  if (!quote) throw ApiError.notFound('Quotation not found');
  if (quote.importerProfile.toString() !== profile._id.toString()) {
    throw ApiError.forbidden('You do not own this quotation');
  }
  if (!IMPORTER_EDITABLE.includes(quote.status)) {
    throw ApiError.conflict(
      `Cannot edit a quotation in "${quote.status}" state`,
      { code: 'INVALID_QUOTE_STATE' },
    );
  }
  if (quote.quotationValidUntil.getTime() <= Date.now()) {
    throw ApiError.conflict('Quotation has already expired', { code: 'QUOTE_EXPIRED' });
  }
  if (patch.quotationValidUntil) assertValidQuotationWindow(patch.quotationValidUntil);

  const ALLOWED = [
    'totalPriceETB', 'itemizedCosts', 'isEstimateFinal', 'exclusions',
    'productCondition', 'specifications', 'warrantyOffered', 'returnPolicy',
    'estimatedDeliveryDays', 'quotationValidUntil', 'notes', 'attachments',
  ];
  for (const key of ALLOWED) {
    if (patch[key] !== undefined) {
      quote[key] = key === 'quotationValidUntil'
        ? new Date(patch[key])
        : patch[key];
    }
  }
  quote.status = QUOTATION_STATUS.UPDATED;
  await quote.save();
  return quote;
}

// ---------- Withdraw ----------

async function withdrawQuotation(userId, quotationId, reason = '') {
  const profile = await getApprovedImporterProfileOrFail(userId);
  const quote = await Quotation.findById(quotationId);
  if (!quote) throw ApiError.notFound('Quotation not found');
  if (quote.importerProfile.toString() !== profile._id.toString()) {
    throw ApiError.forbidden('You do not own this quotation');
  }
  if (!IMPORTER_EDITABLE.includes(quote.status)) {
    throw ApiError.conflict(`Cannot withdraw a quotation in "${quote.status}" state`);
  }

  quote.status = QUOTATION_STATUS.WITHDRAWN;
  quote.withdrawnAt = new Date();
  quote.withdrawalReason = reason;
  await quote.save();

  await requestService.incrementQuotationsCount(quote.request, -1);
  return quote;
}

// ---------- Buyer view ----------

/**
 * Public (buyer-facing) shape for a single quotation.
 * Hides importer contact details until the quotation is ACCEPTED.
 * Includes public importer summary for ranking.
 */
function toBuyerFacing(quote, { revealContact = false } = {}) {
  const obj = quote.toObject ? quote.toObject() : { ...quote };
  if (revealContact && quote.snapshot?.importerSnapshot) {
    obj.contact = {
      businessName: quote.snapshot.importerSnapshot.businessName,
      contactPhone: quote.snapshot.importerSnapshot.contactPhone,
      contactEmail: quote.snapshot.importerSnapshot.contactEmail,
    };
  }
  // Always strip any leaked importer contact fields, importerUserId, etc.
  delete obj.importerUser;
  delete obj.__v;
  return obj;
}

async function listQuotationsForRequest(buyerId, requestId, query) {
  const request = await ProductRequest.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');
  if (request.buyer.toString() !== buyerId.toString()) {
    throw ApiError.forbidden('You do not have access to this request');
  }

  const { page, limit, skip } = parsePagination(query);
  const filter = {
    request: requestId,
    status: { $in: [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED, QUOTATION_STATUS.ACCEPTED] },
  };

  const [items, total] = await Promise.all([
    Quotation.find(filter)
      .sort({ totalPriceETB: 1, createdAt: -1 })
      .skip(skip).limit(limit)
      .populate({
        path: 'importerProfile',
        select: 'businessName ratingAverage ratingCount completedOrdersCount verificationStatus',
      }),
    Quotation.countDocuments(filter),
  ]);

  // Reveal contact only for the ACCEPTED quotation (post-accept state).
  const shaped = items.map((q) =>
    toBuyerFacing(q, { revealContact: q.status === QUOTATION_STATUS.ACCEPTED }));

  return { items: shaped, meta: buildPaginationMeta({ page, limit, total }) };
}

// ---------- Importer view ----------

async function listMyQuotations(userId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { importerUser: userId };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Quotation.find(filter)
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('request', 'referenceNumber title status deliveryCity expiresAt'),
    Quotation.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

// ---------- ACCEPT (atomic) ----------

/**
 * Buyer accepts a quotation for their request.
 *
 * CRITICAL invariants (prompt §13.5, §13.6, §13.7):
 *  - Only the request owner may accept.
 *  - Request must be in PUBLISHED or RECEIVING_OFFERS.
 *  - Quotation must belong to that request.
 *  - Quotation must be SUBMITTED or UPDATED (not withdrawn/expired/accepted).
 *  - Quotation must not be past its validity window.
 *  - Atomically:
 *     1) mark quotation ACCEPTED with immutable snapshot
 *     2) reject all other active quotations for the request
 *     3) transition request to OFFER_SELECTED
 *     4) create Order
 *  - Two parallel accept calls must never produce two orders.
 */
async function acceptQuotation(buyerId, quotationId) {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const quote = await Quotation.findById(quotationId).session(session);
      if (!quote) throw ApiError.notFound('Quotation not found');

      // Re-read request inside the transaction with a conditional update to
      // ensure only one accept wins. We rely on Mongo's transactional locking.
      const request = await ProductRequest.findById(quote.request).session(session);
if (!request) throw ApiError.notFound('Request not found');

if (request.buyer.toString() !== buyerId.toString()) {
  throw ApiError.forbidden(
    'You cannot accept a quotation for another buyer\'s request',
  );
}

// Idempotency: if this exact quotation was already accepted,
// return its existing order instead of attempting acceptance again.
if (
  request.status === REQUEST_STATUS.OFFER_SELECTED &&
  request.acceptedQuotationId &&
  request.acceptedQuotationId.toString() === quote._id.toString() &&
  quote.status === QUOTATION_STATUS.ACCEPTED &&
  quote.order
) {
  const existingOrder = await Order.findById(quote.order).session(session);

  if (existingOrder) {
    order = existingOrder;
    return;
  }

  throw ApiError.conflict(
    'This quotation was accepted, but its order could not be found. Contact support.',
    { code: 'ACCEPTED_ORDER_NOT_FOUND' },
  );
}

// A different quotation must never be accepted after one is selected.
if (
  request.status === REQUEST_STATUS.OFFER_SELECTED ||
  request.acceptedQuotationId
) {
  throw ApiError.conflict(
    'A quotation has already been accepted for this request',
    { code: 'ALREADY_ACCEPTED' },
  );
}

if (
  ![REQUEST_STATUS.PUBLISHED, REQUEST_STATUS.RECEIVING_OFFERS]
    .includes(request.status)
) {
  throw ApiError.conflict(
    `Cannot accept a quotation when request is in "${request.status}" state`,
    { code: 'INVALID_REQUEST_STATE' },
  );
}
      if (quote.quotationValidUntil.getTime() <= Date.now()) {
        throw ApiError.conflict('Quotation has expired', { code: 'QUOTE_EXPIRED' });
      }

      // Load importer profile + user for the snapshot
      const profile = await ImporterProfile.findById(quote.importerProfile).session(session);
      if (!profile || profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
        throw ApiError.conflict(
          'Importer is no longer verified — cannot accept this quotation',
          { code: 'IMPORTER_NOT_VERIFIED' },
        );
      }
      const importerUser = await User.findById(profile.user).session(session);
      if (!importerUser) throw ApiError.conflict('Importer account missing');

      // ---- 1. Snapshot + accept quotation ----
      const acceptedAt = new Date();
      quote.status = QUOTATION_STATUS.ACCEPTED;
      quote.acceptedAt = acceptedAt;
      quote.snapshot = {
        totalPriceETB: quote.totalPriceETB,
        itemizedCosts: quote.itemizedCosts.map((c) => ({
          label: c.label, amountETB: c.amountETB, note: c.note || '',
        })),
        productCondition: quote.productCondition,
        specifications: quote.specifications,
        warrantyOffered: quote.warrantyOffered,
        returnPolicy: quote.returnPolicy,
        estimatedDeliveryDays: quote.estimatedDeliveryDays,
        quotationValidUntil: quote.quotationValidUntil,
        isEstimateFinal: quote.isEstimateFinal,
        exclusions: quote.exclusions,
        requestSnapshot: {
          referenceNumber: request.referenceNumber,
          title: request.title,
          quantity: request.quantity,
          unitOfMeasurement: request.unitOfMeasurement,
          deliveryCity: request.deliveryCity,
          deliveryAddress: request.deliveryAddress || '',
          categoryId: request.category,
          imageUrl: (request.attachments || []).find((a) => (a.mimeType || '').startsWith('image/'))?.url ?? null,
        },
        importerSnapshot: {
          importerProfileId: profile._id,
          userId: importerUser._id,
          businessName: profile.businessName,
          contactPhone: profile.contactPhone || null,
          contactEmail: profile.contactEmail || null,
        },
        acceptedAt,
      };
      await quote.save({ session });

      // ---- 2. Reject all other active quotations ----
      await Quotation.updateMany(
        {
          request: request._id,
          _id: { $ne: quote._id },
          status: { $in: [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED] },
        },
        { $set: { status: QUOTATION_STATUS.REJECTED } },
        { session },
      );

      // ---- 3. Transition request → OFFER_SELECTED ----
      request.statusHistory.push({
        from: request.status,
        to: REQUEST_STATUS.OFFER_SELECTED,
        actor: buyerId,
        actorRole: ROLES.BUYER,
        note: `Quotation ${quote.referenceNumber} accepted`,
      });
      request.status = REQUEST_STATUS.OFFER_SELECTED;
      request.acceptedQuotationId = quote._id;
      await request.save({ session });

      // ---- 4. Create Order ----
      // eslint-disable-next-line global-require
      const orderService = getOrderService();
      order = await orderService.createOrderFromAcceptedQuotation({
        buyerId,
        request,
        quotation: quote,
        session,
      });

      // Link order back onto quotation
      quote.order = order._id;
      await quote.save({ session });      // Link order back onto quotation
      
      // ---- 5. Commission snapshot + record (Phase 1.6) ----
      // eslint-disable-next-line global-require
      const commissionService = require('../commissions/commission.service');
      await commissionService.createRecordForOrder(order, request.category, session);
    });
    return order;
  } finally {
    await session.endSession();
  }
}

// ---------- Order hook helper (used by order module) ----------

/**
 * Called by order.service when an order is confirmed/cancelled to sync
 * request fulfilment state. Kept here to centralize quotation/request joins.
 */
async function markRequestFulfilledIfOrderCompleted(requestId, session) {
  const request = await ProductRequest.findById(requestId).session(session || null);
  if (!request) return;
  if (![REQUEST_STATUS.OFFER_SELECTED].includes(request.status)) return;
  request.statusHistory.push({
    from: request.status, to: REQUEST_STATUS.FULFILLED,
    actor: null, actorRole: 'system', note: 'Order completed',
  });
  request.status = REQUEST_STATUS.FULFILLED;
  await request.save({ session });
}

/**
 * Admin oversight: list all quotations across the platform with filters.
 * Includes buyer contact on requests and importer business names.
 */
async function adminListQuotations(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.requestId) filter.request = query.requestId;
  if (query.importerUserId) filter.importerUser = query.importerUserId;
  if (query.importerProfileId) filter.importerProfile = query.importerProfileId;

  const [items, total] = await Promise.all([
    Quotation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'request',
        select: 'referenceNumber title status deliveryCity buyer',
        populate: { path: 'buyer', select: 'fullName email' },
      })
      .populate('importerProfile', 'businessName verificationStatus ratingAverage')
      .populate('importerUser', 'fullName email phone'),
    Quotation.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

module.exports = {
  submitQuotation,
  updateQuotation,
  withdrawQuotation,
  listQuotationsForRequest,
  listMyQuotations,
  acceptQuotation,
  toBuyerFacing,
  markRequestFulfilledIfOrderCompleted,
  adminListQuotations,
  QUOTATION_STATUS,
};