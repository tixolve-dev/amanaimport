// backend/src/shared/constants/roles.js
'use strict';

const ROLES = Object.freeze({
  BUYER: 'buyer',
  IMPORTER: 'importer',
  ADMIN: 'admin',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ALL_ROLES };