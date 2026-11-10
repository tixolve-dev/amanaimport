// backend/src/modules/payments/payment.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./payment.service');

async function instructions(req, res, next) {
  try {
    const data = await service.getPaymentInstructions(req.user.id, req.params.orderId);
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
}

async function submit(req, res, next) {
  try {
    const record = await service.submitEvidence(
      req.user.id, req.params.orderId, req.body,
    );
    return res.status(201).json(ApiResponse.created(record, 'Payment evidence submitted'));
  } catch (err) { return next(err); }
}

async function listMine(req, res, next) {
  try {
    const items = await service.listMyPaymentsForOrder(req.user.id, req.params.orderId);
    return res.status(200).json(ApiResponse.ok(items));
  } catch (err) { return next(err); }
}

// ---------- Admin ----------

async function adminReview(req, res, next) {
  try {
    const record = await service.adminReviewPayment(
      req.user.id, req.params.id, req.body,
    );
    return res.status(200).json(ApiResponse.ok(record, 'Payment review applied'));
  } catch (err) { return next(err); }
}

async function adminList(req, res, next) {
  try {
    const { items, meta } = await service.adminListPayments(req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function adminGet(req, res, next) {
  try {
    const record = await service.adminGetPayment(req.params.id);
    return res.status(200).json(ApiResponse.ok(record));
  } catch (err) { return next(err); }
}

module.exports = { instructions, submit, listMine, adminReview, adminList, adminGet };