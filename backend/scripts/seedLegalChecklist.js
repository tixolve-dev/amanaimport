// backend/scripts/seedLegalChecklist.js
'use strict';

const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const { LegalChecklistItem } = require('../src/modules/admin/legalChecklist.model');

const ITEMS = [
  { item: 'biz.platform_activity', label: 'Platform business registration permits marketplace activity', category: 'business_registration' },
  { item: 'ecom.electronic_transactions', label: 'Electronic transactions / e-signature framework reviewed', category: 'ecommerce' },
  { item: 'imports.importer_licensing', label: 'Importer eligibility & import-license requirements reviewed', category: 'imports' },
  { item: 'forex.rules', label: 'Foreign-exchange & international-trade rules reviewed', category: 'forex' },
  { item: 'customs.duties', label: 'Customs, duties, taxes & product restrictions reviewed', category: 'customs_tax' },
  {
    item: 'payments.manual_arrangement', label: 'Manual-payment arrangement reviewed with payment advisor',
    category: 'payment_licensing', gatesCapability: 'payments.manual_enabled',
  },
  {
    item: 'payments.psp', label: 'Authorized payment-service provider agreement executed',
    category: 'payment_licensing', gatesCapability: 'payments.psp_enabled',
  },
  { item: 'consumer.protection', label: 'Consumer-protection, refunds & dispute-resolution policy reviewed', category: 'consumer' },
  { item: 'data.protection', label: 'Data-protection & privacy policy reviewed', category: 'data_protection' },
  { item: 'records.electronic', label: 'Electronic-records & business-accounting obligations reviewed', category: 'records_accounting' },
  { item: 'tax.commissions', label: 'Commission/invoice tax treatment reviewed', category: 'commissions_tax' },
];

async function run() {
  await mongoose.connect(env.mongoUri);
  logger.info('[seed] legal checklist — connected');
  for (const it of ITEMS) {
    const existing = await LegalChecklistItem.findOne({ item: it.item });
    if (!existing) {
      await LegalChecklistItem.create(it);
      logger.info(`[seed] created: ${it.item}`);
    }
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});