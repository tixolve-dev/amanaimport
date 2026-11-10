// backend/src/modules/importers/importer.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./importer.service');

async function getMyProfile(req, res, next) {
  try {
    const data = await service.getMyProfile(req.user.id);
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
}


/* backend/src/modules/importers/importer.controller.js
   Add this function before submitVerification(). */

async function saveMyProfile(req, res, next) {
  try {
    const profile = await service.submitVerification(req.user.id, req.body);
    return res.status(200).json(
      ApiResponse.ok(profile, 'Business profile saved'),
    );
  } catch (err) {
    return next(err);
  }
}

async function submitVerification(req, res, next) {
  try {
    const profile = await service.submitVerification(req.user.id, req.body);
    return res.status(200).json(ApiResponse.ok(profile, 'Verification submitted'));
  } catch (err) { return next(err); }
}

async function addDocument(req, res, next) {
  try {
    const doc = await service.addVerificationDocument(req.user.id, req.body);
    return res.status(201).json(ApiResponse.created(doc, 'Document added'));
  } catch (err) { return next(err); }
}

async function removeDocument(req, res, next) {
  try {
    await service.removeVerificationDocument(req.user.id, req.params.documentId);
    return res.status(200).json(ApiResponse.ok(null, 'Document removed'));
  } catch (err) { return next(err); }
}

async function getPublicSummary(req, res, next) {
  try {
    const summary = await service.publicSummary(req.params.importerId);
    return res.status(200).json(ApiResponse.ok(summary));
  } catch (err) { return next(err); }
}

// ---------- Admin ----------

async function adminList(req, res, next) {
  try {
    const items = await service.adminList({
      verificationStatus: req.query.status,
      q: req.query.q,
    });
    return res.status(200).json(ApiResponse.ok(items));
  } catch (err) { return next(err); }
}

async function adminGet(req, res, next) {
  try {
    const data = await service.adminGetById(req.params.importerId);
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
}

async function adminReview(req, res, next) {
  try {
    const profile = await service.adminReview(
      req.user.id, req.params.importerId, req.body,
    );
    return res.status(200).json(ApiResponse.ok(profile, 'Review action applied'));
  } catch (err) { return next(err); }
}

module.exports = {
  getMyProfile,saveMyProfile, submitVerification, addDocument, removeDocument, getPublicSummary,
  adminList, adminGet, adminReview,
};