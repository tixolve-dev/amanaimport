// backend/scripts/seedCommissionRules.js
'use strict';

const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const { CommissionRule } = require('../src/modules/commissions/commissionRule.model');

const RULES = [
  {
    name: 'Default 5% Buyer Fee',
    version: '2026-01-01.v1',
    feeType: 'percentage',
    percentage: 5,
    minFeeETB: 100,
    maxFeeETB: 50000,
    payer: 'buyer',
    categoryIds: [],
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    isActive: true,
    description: 'Default platform fee: 5% paid by buyer, min 100 ETB, max 50,000 ETB.',
  },
];

async function run() {
  await mongoose.connect(env.mongoUri);
  logger.info('[seed] connected');

  for (const r of RULES) {
    const existing = await CommissionRule.findOne({ version: r.version });
    if (existing) {
      logger.info(`[seed] rule ${r.version} already exists — skipped`);
    } else {
      await CommissionRule.create(r);
      logger.info(`[seed] rule ${r.version} created`);
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});