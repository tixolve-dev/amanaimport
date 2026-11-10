// backend/src/modules/admin/admin.routes.js
'use strict';

const express = require('express');
const { param, body, query } = require('express-validator');

// ---- Controllers ----
const importerCtrl = require('../importers/importer.controller');
const importerV = require('../importers/importer.validator');
const orderCtrl = require('../orders/order.controller');
const orderV = require('../orders/order.validator');
const paymentCtrl = require('../payments/payment.controller');
const paymentV = require('../payments/payment.validator');
const commissionCtrl = require('../commissions/commission.controller');
const commissionV = require('../commissions/commission.validator');
const disputeCtrl = require('../disputes/dispute.controller');
const fraudCtrl = require('./fraud.controller');

// ---- Services ----
const messagingService = require('../messaging/messaging.service');
const auditService = require('./auditLog.service');
const reportsService = require('./reports.service');

// ---- Models ----
const { LegalChecklistItem } = require('./legalChecklist.model');

// ---- Shared middleware ----
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');
const ApiResponse = require('../../shared/utils/ApiResponse');

const router = express.Router();

// Every route below requires admin
router.use(authenticate, authorize(ROLES.ADMIN));

// =============================================================
// IMPORTERS
// =============================================================

router.get('/importers', importerCtrl.adminList);

router.get(
  '/importers/:importerId',
  importerV.importerIdRule, validate,
  importerCtrl.adminGet,
);

router.patch(
  '/importers/:importerId/review',
  importerV.adminReviewRules, validate,
  importerCtrl.adminReview,
);

// =============================================================
// ORDERS
// =============================================================

router.get(
  '/orders',
  orderV.listRules, validate,
  orderCtrl.adminList,
);

router.get(
  '/orders/:id',
  orderV.idRule, validate,
  orderCtrl.adminGet,
);

router.post(
  '/orders/:id/transition',
  orderV.adminTransitionRules, validate,
  orderCtrl.adminTransition,
);

// Conversation view for an order (audit / dispute support)
router.get(
  '/orders/:orderId/messages',
  [param('orderId').isMongoId()], validate,
  async (req, res, next) => {
    try {
      const data = await messagingService.adminGetForOrder(req.params.orderId);
      return res.status(200).json(ApiResponse.ok(data));
    } catch (err) { return next(err); }
  },
);

// =============================================================
// PAYMENTS
// =============================================================

router.get(
  '/payments',
  paymentV.listRules, validate,
  paymentCtrl.adminList,
);

router.get(
  '/payments/:id',
  paymentV.idRule, validate,
  paymentCtrl.adminGet,
);

router.post(
  '/payments/:id/review',
  paymentV.verifyRules, validate,
  paymentCtrl.adminReview,
);

// =============================================================
// COMMISSION RULES
// =============================================================

router.get(
  '/commission-rules',
  commissionV.listRules, validate,
  commissionCtrl.list,
);

router.post(
  '/commission-rules',
  commissionV.createRules, validate,
  commissionCtrl.create,
);

router.patch(
  '/commission-rules/:id',
  commissionV.updateRules, validate,
  commissionCtrl.update,
);

router.delete(
  '/commission-rules/:id',
  commissionV.idRule, validate,
  commissionCtrl.remove,
);

// =============================================================
// COMMISSION RECORDS + REVENUE
// =============================================================

router.get(
  '/commission-records',
  commissionV.listRecords, validate,
  commissionCtrl.listRecords,
);

router.get(
  '/revenue/summary',
  commissionCtrl.revenueSummary,
);

router.post(
  '/commission-records/:id/transition',
  commissionV.transitionRules, validate,
  commissionCtrl.transition,
);

// =============================================================
// DISPUTES
// =============================================================

router.get(
  '/disputes',
  [
    query('status').optional().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  disputeCtrl.adminList,
);

router.get(
  '/disputes/:id',
  [param('id').isMongoId()], validate,
  disputeCtrl.adminGet,
);

router.post(
  '/disputes/:id/resolve',
  [
    param('id').isMongoId(),
    body('outcome').isIn([
      'resolved_buyer_favor', 'resolved_importer_favor', 'resolved_mutual',
    ]),
    body('notes').optional().isString().trim().isLength({ max: 2000 }),
    body('refundPromisedETB').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  ],
  validate,
  disputeCtrl.adminResolve,
);

// =============================================================
// AUDIT LOG
// =============================================================

router.get(
  '/audit',
  [
    query('actor').optional().isMongoId(),
    query('action').optional().isString(),
    query('targetType').optional().isString(),
    query('targetId').optional().isMongoId(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { items, meta } = await auditService.list(req.query);
      return res.status(200).json(ApiResponse.paginated(items, meta));
    } catch (err) { return next(err); }
  },
);

// =============================================================
// REPORTS
// =============================================================

const reportQueryRules = [
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
];

router.get('/reports/summary', reportQueryRules, validate, async (req, res, next) => {
  try {
    const data = await reportsService.summary({ from: req.query.from, to: req.query.to });
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
});

router.get('/reports/requests', reportQueryRules, validate, async (req, res, next) => {
  try {
    const data = await reportsService.requestsReport({ from: req.query.from, to: req.query.to });
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
});

router.get('/reports/conversions', reportQueryRules, validate, async (req, res, next) => {
  try {
    const data = await reportsService.conversionsReport({ from: req.query.from, to: req.query.to });
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
});

router.get('/reports/revenue', reportQueryRules, validate, async (req, res, next) => {
  try {
    const data = await reportsService.revenueReport({ from: req.query.from, to: req.query.to });
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
});

router.get('/reports/disputes', reportQueryRules, validate, async (req, res, next) => {
  try {
    const data = await reportsService.disputesReport({ from: req.query.from, to: req.query.to });
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
});

router.get('/reports/importers', reportQueryRules, validate, async (req, res, next) => {
  try {
    const data = await reportsService.importersReport({ from: req.query.from, to: req.query.to });
    return res.status(200).json(ApiResponse.ok(data));
  } catch (err) { return next(err); }
});

// =============================================================
// FRAUD REPORTS
// =============================================================

router.get(
  '/fraud-reports',
  [
    query('status').optional().isString(),
    query('category').optional().isString(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  fraudCtrl.adminList,
);

router.get(
  '/fraud-reports/:id',
  [param('id').isMongoId()], validate,
  fraudCtrl.adminGet,
);

router.patch(
  '/fraud-reports/:id',
  [
    param('id').isMongoId(),
    body('status').isIn(['open', 'investigating', 'resolved_no_action', 'resolved_action_taken']),
    body('notes').optional().isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  fraudCtrl.adminUpdate,
);

// =============================================================
// LEGAL CHECKLIST
// =============================================================

router.get('/legal-checklist', async (req, res, next) => {
  try {
    const items = await LegalChecklistItem.find().sort({ category: 1, item: 1 });
    return res.status(200).json(ApiResponse.ok(items));
  } catch (err) { return next(err); }
});

router.patch(
  '/legal-checklist/:item',
  [
    param('item').isString().trim(),
    body('status').isIn(['not_started', 'in_review', 'advice_obtained', 'enabled']),
    body('notes').optional().isString().trim().isLength({ max: 2000 }),
    body('legalAdviceReference').optional().isString().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const doc = await LegalChecklistItem.findOne({ item: req.params.item });
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Item not found' },
        });
      }
      doc.status = req.body.status;
      if (req.body.notes !== undefined) doc.notes = req.body.notes;
      if (req.body.legalAdviceReference !== undefined) {
        doc.legalAdviceReference = req.body.legalAdviceReference;
      }
      doc.reviewedBy = req.user.id;
      doc.reviewedAt = new Date();
      await doc.save();
      return res.status(200).json(ApiResponse.ok(doc, 'Checklist updated'));
    } catch (err) { return next(err); }
  },
);

// =============================================================
// REQUESTS (admin oversight)
// =============================================================

const requestsService = require('../requests/request.service');
const { REQUEST_STATUS } = require('../requests/request.statuses');

router.get(
  '/requests',
  [
    query('status').optional().isIn(Object.values(REQUEST_STATUS)),
    query('category').optional().isMongoId(),
    query('city').optional().isString().trim().isLength({ max: 100 }),
    query('buyerId').optional().isMongoId(),
    query('q').optional().isString().trim().isLength({ max: 100 }),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { items, meta } = await requestsService.adminListRequests(req.query);
      return res.status(200).json(ApiResponse.paginated(items, meta));
    } catch (err) { return next(err); }
  },
);

router.get(
  '/requests/:id',
  [param('id').isMongoId()],
  validate,
  async (req, res, next) => {
    try {
      const doc = await requestsService.adminGetRequest(req.params.id);
      return res.status(200).json(ApiResponse.ok(doc));
    } catch (err) { return next(err); }
  },
);

// =============================================================
// QUOTATIONS (admin oversight)
// =============================================================

const quotationsService = require('../quotations/quotation.service');
const { QUOTATION_STATUS } = require('../quotations/quotation.statuses');

router.get(
  '/quotations',
  [
    query('status').optional().isIn(Object.values(QUOTATION_STATUS)),
    query('requestId').optional().isMongoId(),
    query('importerUserId').optional().isMongoId(),
    query('importerProfileId').optional().isMongoId(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { items, meta } = await quotationsService.adminListQuotations(req.query);
      return res.status(200).json(ApiResponse.paginated(items, meta));
    } catch (err) { return next(err); }
  },
);
// =============================================================
// ADMIN: reply inside an order conversation
// =============================================================

const messagingCtrl = require('../messaging/messaging.controller');

router.post(
  '/orders/:orderId/messages',
  [
    param('orderId').isMongoId(),
    body('body').isString().trim().isLength({ min: 1, max: 2000 }),
  ],
  validate,
  messagingCtrl.adminSend,
);
module.exports = router;