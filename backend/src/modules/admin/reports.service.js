// backend/src/modules/admin/reports.service.js
'use strict';

const { ProductRequest } = require('../requests/productRequest.model');
const { REQUEST_STATUS } = require('../requests/request.statuses');
const { Quotation } = require('../quotations/quotation.model');
const { QUOTATION_STATUS } = require('../quotations/quotation.statuses');
const { Order } = require('../orders/order.model');
const { ORDER_STATUS } = require('../orders/order.statuses');
const { Dispute, DISPUTE_STATUS } = require('../disputes/dispute.model');
const { ImporterProfile, VERIFICATION_STATUS } = require('../importers/importerProfile.model');
const { CommissionRecord } = require('../commissions/commissionRecord.model');
const { PaymentRecord } = require('../payments/paymentRecord.model');

function windowFilter(from, to) {
  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  return filter;
}

async function requestsReport({ from, to } = {}) {
  const match = windowFilter(from, to);
  const agg = await ProductRequest.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = {};
  for (const row of agg) byStatus[row._id] = row.count;
  const total = agg.reduce((s, r) => s + r.count, 0);

  // Category breakdown
  const byCategory = await ProductRequest.aggregate([
    { $match: match },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, categoryId: '$_id', name: '$cat.name', count: 1 } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);

  return { total, byStatus, byCategory };
}

async function conversionsReport({ from, to } = {}) {
  const match = windowFilter(from, to);
  const [requests, quotations, orders, acceptedQuotes] = await Promise.all([
    ProductRequest.countDocuments({ ...match, status: { $ne: REQUEST_STATUS.DRAFT } }),
    Quotation.countDocuments(match),
    Order.countDocuments(match),
    Quotation.countDocuments({ ...match, status: QUOTATION_STATUS.ACCEPTED }),
  ]);
  const requestToQuote = requests ? (quotations / requests) : 0;
  const requestToOrder = requests ? (orders / requests) : 0;
  return {
    requests, quotations, orders, acceptedQuotes,
    avgQuotationsPerRequest: Number((quotations / Math.max(requests, 1)).toFixed(2)),
    requestToQuoteRate: Number((requestToQuote * 100).toFixed(2)),
    requestToOrderRate: Number((requestToOrder * 100).toFixed(2)),
  };
}

async function revenueReport({ from, to } = {}) {
  const match = windowFilter(from, to);
  const agg = await CommissionRecord.aggregate([
    { $match: match },
    { $group: { _id: '$revenueState', count: { $sum: 1 }, total: { $sum: '$computedFeeETB' } } },
  ]);
  const out = {
    pending: { count: 0, total: 0 },
    invoiced: { count: 0, total: 0 },
    received: { count: 0, total: 0 },
    waived: { count: 0, total: 0 },
    refunded: { count: 0, total: 0 },
  };
  for (const r of agg) out[r._id] = { count: r.count, total: r.total };

  const paidAmountAgg = await PaymentRecord.aggregate([
    { $match: { ...match, status: 'verified' } },
    { $group: { _id: null, total: { $sum: '$amountETB' }, count: { $sum: 1 } } },
  ]);
  out.verifiedPayments = paidAmountAgg[0] || { total: 0, count: 0 };

  return out;
}

async function disputesReport({ from, to } = {}) {
  const match = windowFilter(from, to);
  const agg = await Dispute.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = {};
  for (const row of agg) byStatus[row._id] = row.count;
  const total = agg.reduce((s, r) => s + r.count, 0);

  const byReason = await Dispute.aggregate([
    { $match: match },
    { $group: { _id: '$reason', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const open = (byStatus[DISPUTE_STATUS.OPEN] || 0) + (byStatus[DISPUTE_STATUS.UNDER_REVIEW] || 0);
  return { total, open, byStatus, byReason };
}

async function importersReport({ from, to } = {}) {
  const match = windowFilter(from, to);
  const agg = await ImporterProfile.aggregate([
    { $match: match },
    { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
  ]);
  const byStatus = {};
  for (const row of agg) byStatus[row._id] = row.count;

  const top = await ImporterProfile.find({
    verificationStatus: VERIFICATION_STATUS.APPROVED,
    completedOrdersCount: { $gt: 0 },
  })
    .sort({ completedOrdersCount: -1, ratingAverage: -1 })
    .limit(10)
    .select('businessName completedOrdersCount ratingAverage ratingCount');

  return { byStatus, top };
}

async function summary({ from, to } = {}) {
  const [reqs, conv, rev, disp, imp] = await Promise.all([
    requestsReport({ from, to }),
    conversionsReport({ from, to }),
    revenueReport({ from, to }),
    disputesReport({ from, to }),
    importersReport({ from, to }),
  ]);
  return { requests: reqs, conversions: conv, revenue: rev, disputes: disp, importers: imp };
}

module.exports = { requestsReport, conversionsReport, revenueReport, disputesReport, importersReport, summary };