// backend/src/modules/commissions/commission.service.js
'use strict';

const { CommissionRule, FEE_TYPE, PAYER } = require('./commissionRule.model');
const { CommissionRecord, REVENUE_STATE } = require('./commissionRecord.model');
const ApiError = require('../../shared/utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

// ---------- Rule CRUD (admin) ----------

async function createRule(adminId, payload) {
  if (!payload.version) {
    throw ApiError.badRequest('version is required (e.g. "2026-01-01.v1")');
  }
  const existing = await CommissionRule.findOne({ version: payload.version });
  if (existing) throw ApiError.conflict('Rule version already exists', {
    code: 'DUPLICATE_RULE_VERSION',
  });

  if (payload.feeType === FEE_TYPE.PERCENTAGE) {
    if (payload.percentage == null || payload.percentage < 0 || payload.percentage > 100) {
      throw ApiError.badRequest('percentage must be 0–100 for percentage fee');
    }
  } else if (payload.feeType === FEE_TYPE.FIXED) {
    if (payload.fixedAmountETB == null || payload.fixedAmountETB < 0) {
      throw ApiError.badRequest('fixedAmountETB must be >= 0 for fixed fee');
    }
  } else {
    throw ApiError.badRequest('feeType must be percentage or fixed');
  }

  const rule = await CommissionRule.create({
    ...payload,
    createdBy: adminId,
  });
  return rule;
}

async function updateRule(adminId, ruleId, patch) {
  const rule = await CommissionRule.findById(ruleId);
  if (!rule) throw ApiError.notFound('Commission rule not found');
  // Once a version is created, amounts/percentage are immutable. Allow only:
  //  - effectiveUntil adjustment (to shorten validity)
  //  - isActive toggle
  //  - description / notes
  const ALLOWED = ['effectiveUntil', 'isActive', 'description'];
  for (const key of ALLOWED) {
    if (patch[key] !== undefined) rule[key] = patch[key];
  }
  rule.notes = patch.notes !== undefined ? patch.notes : rule.notes;
  await rule.save();
  return rule;
}

async function listRules(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.category) filter.categoryIds = query.category;

  const [items, total] = await Promise.all([
    CommissionRule.find(filter).sort({ effectiveFrom: -1 }).skip(skip).limit(limit),
    CommissionRule.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

async function deleteRule(ruleId) {
  // Never delete — deactivate instead. Preserves accounting integrity.
  const rule = await CommissionRule.findById(ruleId);
  if (!rule) throw ApiError.notFound('Rule not found');
  rule.isActive = false;
  await rule.save();
  return { deactivated: true };
}

// ---------- Rule resolution ----------

/**
 * Find the most specific active rule matching the category at acceptance time.
 * Priority: exact categoryId > global (categoryIds empty)
 * Among matches, prefer the newest effectiveFrom.
 */
async function resolveRuleForCategory(categoryId, when = new Date()) {
  const filters = {
    isActive: true,
    effectiveFrom: { $lte: when },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: when } }],
  };

  const [exact, global] = await Promise.all([
    CommissionRule.find({ ...filters, categoryIds: categoryId })
      .sort({ effectiveFrom: -1 }).limit(1),
    CommissionRule.find({ ...filters, categoryIds: { $size: 0 } })
      .sort({ effectiveFrom: -1 }).limit(1),
  ]);

  const rule = exact[0] || global[0];
  if (!rule) {
    throw ApiError.conflict(
      'No active commission rule matches this category — cannot accept quotations',
      { code: 'NO_COMMISSION_RULE' },
    );
  }
  return rule;
}

// ---------- Fee calculation ----------

/**
 * @param {import('mongoose').Document} rule
 * @param {number} orderValueETB
 * @returns {number} rounded to 2 decimals, clamped to min/max
 */
function computeFeeForRule(rule, orderValueETB) {
  const orderValue = Number(orderValueETB);

  if (!Number.isFinite(orderValue) || orderValue < 0) {
    throw ApiError.badRequest('orderValueETB must be a valid number >= 0');
  }

  let fee = 0;

  if (rule.feeType === FEE_TYPE.PERCENTAGE) {
    fee = (Number(rule.percentage) / 100) * orderValue;
  } else {
    fee = Number(rule.fixedAmountETB);
  }

  if (rule.minFeeETB != null && fee < Number(rule.minFeeETB)) {
    fee = Number(rule.minFeeETB);
  }

  if (rule.maxFeeETB != null && fee > Number(rule.maxFeeETB)) {
    fee = Number(rule.maxFeeETB);
  }

  return Math.round((fee + Number.EPSILON) * 100) / 100;
}

async function computeFeePreview(categoryId, orderValueETB, when = new Date()) {
  const orderValue = Number(orderValueETB);

  if (!Number.isFinite(orderValue) || orderValue < 0) {
    throw ApiError.badRequest('orderValueETB must be a valid number >= 0');
  }

  const rule = await resolveRuleForCategory(categoryId, when);
  const fee = computeFeeForRule(rule, orderValue);

  const buyerTotalETB =
    rule.payer === PAYER.BUYER
      ? Math.round((orderValue + fee + Number.EPSILON) * 100) / 100
      : orderValue;

  const importerTotalETB =
    rule.payer === PAYER.IMPORTER
      ? Math.round((orderValue - fee + Number.EPSILON) * 100) / 100
      : orderValue;

  return {
    ruleVersion: rule.version,
    ruleId: rule._id,
    feeType: rule.feeType,
    percentage: rule.percentage,
    fixedAmountETB: rule.fixedAmountETB,
    payer: rule.payer,
    orderValueETB: orderValue,
    feeETB: fee,
    buyerTotalETB,
    importerTotalETB,
  };
}


/**
 * Called from quotation acceptance inside a Mongo session.
 * Snapshots the rule and writes the CommissionRecord.
 * The order document is then patched with the fee + rule version.
 */
async function createRecordForOrder(order, categoryId, session) {
  const rule = await resolveRuleForCategory(categoryId, order.acceptedAt);
  const fee = computeFeeForRule(rule, order.totalPriceETB);

  const [record] = await CommissionRecord.create([{
    order: order._id,
    buyer: order.buyer,
    importerUser: order.importerUser,
    ruleVersion: rule.version,
    ruleId: rule._id,
    feeType: rule.feeType,
    percentage: rule.percentage,
    fixedAmountETB: rule.fixedAmountETB,
    payer: rule.payer,
    orderValueETB: order.totalPriceETB,
    computedFeeETB: fee,
    revenueState: REVENUE_STATE.PENDING,
  }], { session });

  // Patch order with fee snapshot
  order.platformFeeETB = fee;
  order.platformFeePayer = rule.payer;
  order.commissionRuleVersion = rule.version;
  await order.save({ session });

  return { record, rule, fee };
}

// ---------- Revenue state transitions (admin) ----------

const VALID_REVENUE_TRANSITIONS = Object.freeze({
  [REVENUE_STATE.PENDING]: [REVENUE_STATE.INVOICED, REVENUE_STATE.WAIVED],
  [REVENUE_STATE.INVOICED]: [REVENUE_STATE.RECEIVED, REVENUE_STATE.WAIVED, REVENUE_STATE.REFUNDED],
  [REVENUE_STATE.RECEIVED]: [REVENUE_STATE.REFUNDED],
  [REVENUE_STATE.WAIVED]: [],
  [REVENUE_STATE.REFUNDED]: [],
});

async function transitionRevenueState(adminId, recordId, to, note = '', reason = '') {
  const record = await CommissionRecord.findById(recordId);
  if (!record) throw ApiError.notFound('Commission record not found');

  const allowed = VALID_REVENUE_TRANSITIONS[record.revenueState] || [];
  if (!allowed.includes(to)) {
    throw ApiError.conflict(
      `Invalid revenue transition: "${record.revenueState}" → "${to}"`,
      { code: 'INVALID_REVENUE_TRANSITION' },
    );
  }

  record.revenueState = to;
  if (to === REVENUE_STATE.INVOICED) record.invoicedAt = new Date();
  if (to === REVENUE_STATE.RECEIVED) record.receivedAt = new Date();
  if (to === REVENUE_STATE.WAIVED) record.waiverReason = reason;
  if (to === REVENUE_STATE.REFUNDED) record.refundReason = reason;
  if (note) record.notes = note;
  await record.save();
  return record;
}

// ---------- Reporting ----------

async function listRecords(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.revenueState) filter.revenueState = query.revenueState;
  if (query.payer) filter.payer = query.payer;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    CommissionRecord.find(filter)
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('order', 'referenceNumber status totalPriceETB'),
    CommissionRecord.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

/**
 * Reconciled revenue summary. Prompts §7: distinguish earned vs invoiced vs received.
 */
async function revenueSummary({ from, to } = {}) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  const agg = await CommissionRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$revenueState',
        count: { $sum: 1 },
        total: { $sum: '$computedFeeETB' },
      },
    },
  ]);

  const result = {
    pending: { count: 0, total: 0 },
    invoiced: { count: 0, total: 0 },
    received: { count: 0, total: 0 },
    waived: { count: 0, total: 0 },
    refunded: { count: 0, total: 0 },
  };
  for (const row of agg) result[row._id] = { count: row.count, total: row.total };

  return result;
}

// ---------- Order value patch (for future refund/adjustment) ----------

async function adjustRecordAmount(adminId, recordId, newAmountETB, note = '') {
  const record = await CommissionRecord.findById(recordId);
  if (!record) throw ApiError.notFound('Commission record not found');
  if (record.revenueState === REVENUE_STATE.RECEIVED) {
    throw ApiError.conflict('Cannot adjust a record that has been received');
  }
  record.computedFeeETB = Math.round(newAmountETB * 100) / 100;
  record.notes = `${record.notes}\n[admin ${adminId}] ${note}`.trim();
  await record.save();
  return record;
}

module.exports = {
  createRule,
  updateRule,
  listRules,
  deleteRule,
  resolveRuleForCategory,
  computeFeeForRule,
  computeFeePreview,
  createRecordForOrder,
  transitionRevenueState,
  listRecords,
  revenueSummary,
  adjustRecordAmount,
  FEE_TYPE,
  PAYER,
  REVENUE_STATE,
};