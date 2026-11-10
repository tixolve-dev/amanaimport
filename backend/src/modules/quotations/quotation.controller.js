// backend/src/modules/quotations/quotation.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./quotation.service');

async function submit(req, res, next) {
  try {
    const quote = await service.submitQuotation(
      req.user.id, req.params.requestId, req.body,
    );
    return res.status(201).json(ApiResponse.created(quote, 'Quotation submitted'));
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const quote = await service.updateQuotation(req.user.id, req.params.id, req.body);
    return res.status(200).json(ApiResponse.ok(quote, 'Quotation updated'));
  } catch (err) { return next(err); }
}

async function withdraw(req, res, next) {
  try {
    const quote = await service.withdrawQuotation(
      req.user.id, req.params.id, req.body.reason || '',
    );
    return res.status(200).json(ApiResponse.ok(quote, 'Quotation withdrawn'));
  } catch (err) { return next(err); }
}

async function listForRequest(req, res, next) {
  try {
    const { items, meta } = await service.listQuotationsForRequest(
      req.user.id, req.params.requestId, req.query,
    );
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function listMine(req, res, next) {
  try {
    const { items, meta } = await service.listMyQuotations(req.user.id, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function accept(req, res, next) {
  try {
    const order = await service.acceptQuotation(req.user.id, req.params.id);
    return res.status(201).json(ApiResponse.created(order, 'Quotation accepted; order created'));
  } catch (err) { return next(err); }
}

module.exports = { submit, update, withdraw, listForRequest, listMine, accept };