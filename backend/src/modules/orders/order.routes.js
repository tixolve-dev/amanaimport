// // backend/src/modules/orders/order.routes.js
// 'use strict';

// const express = require('express');
// const ctrl = require('./order.controller');
// const v = require('./order.validator');
// const { authenticate } = require('../../shared/middleware/authenticate');
// const { authorize } = require('../../shared/middleware/authorize');
// const { validate } = require('../../shared/middleware/validate');
// const { ROLES } = require('../../shared/constants/roles');

// const router = express.Router();
// router.use(authenticate);

// // Buyer + importer
// router.get('/', authorize(ROLES.BUYER, ROLES.IMPORTER), v.listRules, validate, ctrl.listMine);
// router.get('/:id', authorize(ROLES.BUYER, ROLES.IMPORTER), v.idRule, validate, ctrl.getOne);
// router.post(
//   '/:id/transition',
//   authorize(ROLES.BUYER, ROLES.IMPORTER),
//   v.transitionRules, validate, ctrl.transition,
// );

// module.exports = router;


'use strict';

const express = require('express');
const ctrl = require('./order.controller');
const { authenticate } = require('../../shared/middleware/authenticate');
const { authorize } = require('../../shared/middleware/authorize');
const { validate } = require('../../shared/middleware/validate');
const { ROLES } = require('../../shared/constants/roles');
const v = require('./order.validator');

const router = express.Router();

router.use(authenticate);

// User endpoints
router.get(
  '/me',
  authorize(ROLES.BUYER, ROLES.IMPORTER),
  v.listRules,
  validate,
  ctrl.listMine,
);

router.get(
  '/me/:id',
  authorize(ROLES.BUYER, ROLES.IMPORTER),
  v.idRule,
  validate,
  ctrl.getOne,
);

router.post(
  '/:id/transition',
  authorize(ROLES.BUYER, ROLES.IMPORTER),
  v.transitionRules,
  validate,
  ctrl.transition,
);

// Admin endpoints
router.get(
  '/admin',
  authorize(ROLES.ADMIN),
  v.listRules,
  validate,
  ctrl.adminList,
);

router.get(
  '/admin/:id',
  authorize(ROLES.ADMIN),
  v.idRule,
  validate,
  ctrl.adminGet,
);

router.post(
  '/admin/:id/transition',
  authorize(ROLES.ADMIN),
  v.adminTransitionRules,
  validate,
  ctrl.adminTransition,
);

module.exports = router;


