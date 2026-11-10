// backend/scripts/seedDemo.js
'use strict';

/**
 * Creates a small, consistent demo dataset: 2 buyers, 3 importers (2 approved,
 * 1 pending), 5 requests (some published), quotations, 1 completed order.
 *
 * Idempotent: safe to re-run — skips existing users by email.
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const { User } = require('../src/modules/users/user.model');
const { Category } = require('../src/modules/categories/category.model');
const { ImporterProfile } = require('../src/modules/importers/importerProfile.model');
const { ProductRequest } = require('../src/modules/requests/productRequest.model');
const { Quotation } = require('../src/modules/quotations/quotation.model');
const { Order } = require('../src/modules/orders/order.model');
const { CommissionRule } = require('../src/modules/commissions/commissionRule.model');
const { CommissionRecord } = require('../src/modules/commissions/commissionRecord.model');
const { ROLES } = require('../src/shared/constants/roles');
const { generateRequestRef, generateQuoteRef, generateOrderRef } = require('../src/shared/utils/referenceNumber');

const DEMO_PASSWORD = 'DemoPass123';

async function ensureUser(data) {
  let u = await User.findOne({ email: data.email });
  if (u) return u;
  u = new User(data);
  await u.setPassword(DEMO_PASSWORD);
  await u.save();
  logger.info(`[demo] user ${data.email} created (password: ${DEMO_PASSWORD})`);
  return u;
}

async function run() {
  await mongoose.connect(env.mongoUri);
  logger.info('[demo] connected');

  // Categories
  let cat = await Category.findOne({ slug: 'electronics' });
  if (!cat) {
    cat = await Category.create({ name: 'Electronics', slug: 'electronics', isActive: true });
  }

  // Commission rule (reuse seed rule)
  let rule = await CommissionRule.findOne({ isActive: true });
  if (!rule) {
    rule = await CommissionRule.create({
      name: 'Demo 5%', version: `demo.${Date.now()}`, feeType: 'percentage',
      percentage: 5, payer: 'buyer', categoryIds: [],
      effectiveFrom: new Date('2020-01-01'), isActive: true,
    });
  }

  // Users
  const buyerA = await ensureUser({
    fullName: 'Demo Buyer A', email: 'buyer.a@demo.local', phone: '0911001001', role: ROLES.BUYER,
  });
  const buyerB = await ensureUser({
    fullName: 'Demo Buyer B', email: 'buyer.b@demo.local', phone: '0911001002', role: ROLES.BUYER,
  });
  const impA = await ensureUser({
    fullName: 'Importer A', email: 'importer.a@demo.local', phone: '0911002001', role: ROLES.IMPORTER,
  });
  const impB = await ensureUser({
    fullName: 'Importer B', email: 'importer.b@demo.local', phone: '0911002002', role: ROLES.IMPORTER,
  });
  const impPending = await ensureUser({
    fullName: 'Importer Pending', email: 'importer.pending@demo.local', phone: '0911002003', role: ROLES.IMPORTER,
  });

  // Importer profiles
  async function ensureProfile(user, businessName, status) {
    let p = await ImporterProfile.findOne({ user: user._id });
    if (!p) {
      p = await ImporterProfile.create({
        user: user._id, businessName, verificationStatus: status,
        verifiedAt: status === 'approved' ? new Date() : null,
        serviceAreas: ['Addis Ababa'],
        contactPhone: user.phone, contactEmail: user.email,
      });
      logger.info(`[demo] profile for ${businessName}: ${status}`);
    }
    return p;
  }
  const profA = await ensureProfile(impA, 'Abyssinia Imports Ltd', 'approved');
  const profB = await ensureProfile(impB, 'Ras Trading', 'approved');
  await ensureProfile(impPending, 'Pending Imports', 'pending');

  // Requests
  async function ensureRequest(buyer, title, overrides = {}) {
    let r = await ProductRequest.findOne({ buyer: buyer._id, title });
    if (r) return r;
    r = await ProductRequest.create({
      referenceNumber: generateRequestRef(),
      buyer: buyer._id,
      title, description: `${title} — demo request. Brand new with warranty.`,
      category: cat._id,
      quantity: 1,
      deliveryCity: 'Addis Ababa',
      status: 'published',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      publishedAt: new Date(),
      statusHistory: [{ from: null, to: 'published', actor: buyer._id, actorRole: ROLES.BUYER }],
      ...overrides,
    });
    logger.info(`[demo] request ${r.referenceNumber}: ${title}`);
    return r;
  }

  const reqs = await Promise.all([
    ensureRequest(buyerA, 'MacBook Pro 14 M3'),
    ensureRequest(buyerA, 'iPhone 15 Pro Max 256GB'),
    ensureRequest(buyerB, 'Toyota Hilux brake pads set'),
    ensureRequest(buyerB, 'Industrial air compressor 5HP'),
    ensureRequest(buyerA, 'Solar panel 400W mono'),
  ]);

  // A quotation from each approved importer on the first two requests
  async function ensureQuote(request, importerUser, importerProfile, amount, overrides = {}) {
    let q = await Quotation.findOne({ request: request._id, importerProfile: importerProfile._id });
    if (q) return q;
    q = await Quotation.create({
      referenceNumber: generateQuoteRef(),
      request: request._id,
      importerProfile: importerProfile._id,
      importerUser: importerUser._id,
      totalPriceETB: amount,
      itemizedCosts: [
        { label: 'Product', amountETB: Math.round(amount * 0.85) },
        { label: 'Shipping', amountETB: Math.round(amount * 0.1) },
        { label: 'Customs (est.)', amountETB: Math.round(amount * 0.05) },
      ],
      productCondition: 'new',
      estimatedDeliveryDays: 14,
      quotationValidUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      status: 'submitted',
      ...overrides,
    });
    await ProductRequest.updateOne(
      { _id: request._id },
      {
        $inc: { quotationsCount: 1 },
        $set: { status: 'receiving_offers' },
      },
    );
    logger.info(`[demo] quotation ${q.referenceNumber} (${amount} ETB)`);
    return q;
  }

  await ensureQuote(reqs[0], impA, profA, 145000);
  await ensureQuote(reqs[0], impB, profB, 148000);
  await ensureQuote(reqs[1], impA, profA, 92000);
  await ensureQuote(reqs[2], impB, profB, 7500);

  // One accepted + completed order for demo richness
  let order = await Order.findOne({ buyer: buyerA._id, 'snapshot.title': 'MacBook Pro 14 M3' });
  if (!order) {
    const acceptedQuote = await Quotation.findOne({
      request: reqs[0]._id, importerProfile: profA._id,
    });
    if (acceptedQuote) {
      const acceptedAt = new Date(Date.now() - 15 * 24 * 3600 * 1000);
      acceptedQuote.status = 'accepted';
      acceptedQuote.acceptedAt = acceptedAt;
      acceptedQuote.snapshot = {
        totalPriceETB: acceptedQuote.totalPriceETB,
        itemizedCosts: acceptedQuote.itemizedCosts.map((c) => ({
          label: c.label, amountETB: c.amountETB, note: c.note || '',
        })),
        productCondition: acceptedQuote.productCondition,
        specifications: '',
        warrantyOffered: '12 months',
        returnPolicy: '14 days',
        estimatedDeliveryDays: acceptedQuote.estimatedDeliveryDays,
        quotationValidUntil: acceptedQuote.quotationValidUntil,
        isEstimateFinal: false,
        exclusions: '',
        requestSnapshot: {
          referenceNumber: reqs[0].referenceNumber,
          title: reqs[0].title,
          quantity: reqs[0].quantity,
          unitOfMeasurement: reqs[0].unitOfMeasurement,
          deliveryCity: reqs[0].deliveryCity,
          deliveryAddress: '',
          categoryId: reqs[0].category,
        },
        importerSnapshot: {
          importerProfileId: profA._id,
          userId: impA._id,
          businessName: profA.businessName,
          contactPhone: profA.contactPhone,
          contactEmail: profA.contactEmail,
        },
        acceptedAt,
      };
      await acceptedQuote.save();

      order = await Order.create({
        referenceNumber: generateOrderRef(),
        buyer: buyerA._id,
        importerUser: impA._id,
        importerProfile: profA._id,
        request: reqs[0]._id,
        quotation: acceptedQuote._id,
        snapshot: {
          requestReferenceNumber: reqs[0].referenceNumber,
          quotationReferenceNumber: acceptedQuote.referenceNumber,
          title: reqs[0].title,
          quantity: reqs[0].quantity,
          unitOfMeasurement: reqs[0].unitOfMeasurement,
          deliveryCity: 'Addis Ababa',
          deliveryAddress: '',
          productCondition: 'new',
          specifications: '',
          warrantyOffered: '12 months',
          returnPolicy: '14 days',
          estimatedDeliveryDays: 14,
          isEstimateFinal: false,
          exclusions: '',
          itemizedCosts: [],
          importerBusinessName: profA.businessName,
        },
        totalPriceETB: acceptedQuote.totalPriceETB,
        platformFeeETB: Math.round(acceptedQuote.totalPriceETB * 0.05),
        platformFeePayer: 'buyer',
        commissionRuleVersion: rule.version,
        status: 'completed',
        acceptedAt,
        completedAt: new Date(),
        statusHistory: [
          { from: null, to: 'awaiting_payment_confirmation', actor: buyerA._id, actorRole: ROLES.BUYER, at: acceptedAt },
          { from: 'awaiting_payment_confirmation', to: 'payment_condition_satisfied', actor: buyerA._id, actorRole: 'admin', at: new Date(Date.now() - 14 * 86400000) },
          { from: 'payment_condition_satisfied', to: 'processing', actor: impA._id, actorRole: 'importer', at: new Date(Date.now() - 13 * 86400000) },
          { from: 'processing', to: 'delivered', actor: impA._id, actorRole: 'importer', at: new Date(Date.now() - 1 * 86400000) },
          { from: 'delivered', to: 'completed', actor: buyerA._id, actorRole: ROLES.BUYER, at: new Date() },
        ],
      });
      await Quotation.updateOne({ _id: acceptedQuote._id }, { $set: { order: order._id } });
      await ProductRequest.updateOne(
        { _id: reqs[0]._id },
        { $set: { status: 'fulfilled', acceptedQuotationId: acceptedQuote._id } },
      );
      await CommissionRecord.create({
        order: order._id,
        buyer: buyerA._id,
        importerUser: impA._id,
        ruleVersion: rule.version,
        ruleId: rule._id,
        feeType: 'percentage',
        percentage: 5,
        payer: 'buyer',
        orderValueETB: order.totalPriceETB,
        computedFeeETB: order.platformFeeETB,
        revenueState: 'received',
        invoicedAt: new Date(),
        receivedAt: new Date(),
      });
      await ImporterProfile.updateOne(
        { _id: profA._id },
        { $inc: { completedOrdersCount: 1 } },
      );
      logger.info(`[demo] order ${order.referenceNumber} created (completed)`);
    }
  }

  logger.info('[demo] DONE');
  logger.info(`[demo] Login with any of these emails + password "${DEMO_PASSWORD}"`);
  logger.info('[demo] buyer.a@demo.local / buyer.b@demo.local');
  logger.info('[demo] importer.a@demo.local / importer.b@demo.local / importer.pending@demo.local');

  await mongoose.disconnect();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});