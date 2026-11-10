// backend/src/routes/v1.js
'use strict';

const express = require('express');
const ApiResponse = require('../shared/utils/ApiResponse');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json(ApiResponse.ok({ scope: 'v1', status: 'ok' }, 'OK'));
});

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/users', require('../modules/users/user.routes'));
router.use('/categories', require('../modules/categories/category.routes'));
router.use('/importers', require('../modules/importers/importer.routes'));
router.use('/uploads', require('../modules/uploads/upload.routes'));
router.use('/admin', require('../modules/admin/admin.routes'));
router.use('/requests', require('../modules/requests/request.routes'));
router.use('/quotations', require('../modules/quotations/quotation.routes'));
router.use('/orders', require('../modules/orders/order.routes'));
router.use('/payments', require('../modules/payments/payment.routes'));
router.use('/commissions', require('../modules/commissions/commission.routes'));
router.use('/notifications', require('../modules/notifications/notification.routes'));
router.use('/shipments', require('../modules/shipments/shipment.routes'));
router.use('/messages', require('../modules/messaging/messaging.routes'));
router.use('/disputes', require('../modules/disputes/dispute.routes'));
router.use('/reviews', require('../modules/reviews/review.routes'));
router.use('/fraud-reports', require('../modules/admin/fraud.routes'));

module.exports = router;