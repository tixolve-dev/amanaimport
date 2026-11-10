// backend/src/modules/reviews/review.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./review.service');

async function submit(req, res, next) {
  try {
    const review = await service.submitReview(req.user.id, req.params.orderId, req.body);
    return res.status(201).json(ApiResponse.created(review, 'Review submitted'));
  } catch (err) { return next(err); }
}

async function listForImporter(req, res, next) {
  try {
    const { items, meta } = await service.listForImporter(req.params.importerId, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

module.exports = { submit, listForImporter };