// backend/tests/integration/payment.integration.test.js
'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345678901234567890';
process.env.MANUAL_PAY_ACCOUNT = '1000123456789';
process.env.MANUAL_PAY_BANK = 'CBE';
process.env.MANUAL_PAY_RECIPIENT_NAME = 'Test Recipient';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongod; let app;
let User; let Category; let ImporterProfile; let Order;
let CommissionRule; let CommissionRecord; let PaymentRecord;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });

  process.env.MONGO_URI = mongod.getUri('ethio_test_payment');

  await mongoose.connect(process.env.MONGO_URI);

  app = require('../../src/app')();

  ({ User } = require('../../src/modules/users/user.model'));
  ({ Category } = require('../../src/modules/categories/category.model'));
  ({ ImporterProfile } = require('../../src/modules/importers/importerProfile.model'));
  ({ Order } = require('../../src/modules/orders/order.model'));
  ({ CommissionRule } = require('../../src/modules/commissions/commissionRule.model'));
  ({ CommissionRecord } = require('../../src/modules/commissions/commissionRecord.model'));
  ({ PaymentRecord } = require('../../src/modules/payments/paymentRecord.model'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const cols = await mongoose.connection.db.collections();
  for (const c of cols) await c.deleteMany({});
});

// ---------- Fixtures ----------

let seq = 0;
async function createUser(role) {
  seq += 1;
  const u = new User({
    fullName: `U${seq}`, email: `u${seq}@test.local`,
    phone: `09${String(10000000 + seq).slice(-8)}`, role,
  });
  await u.setPassword('StrongPass123');
  await u.save();
  return u;
}
async function loginAs(u) {
  const r = await request(app).post('/api/v1/auth/login')
    .send({ identifier: u.email, password: 'StrongPass123' });
  return r.body.data.tokens.accessToken;
}
async function approvedImporter() {
  const u = await createUser('importer');
  await ImporterProfile.create({
    user: u._id, businessName: `Co ${seq}`,
    verificationStatus: 'approved', verifiedAt: new Date(),
  });
  return u;
}
async function seedRule(overrides = {}) {
  seq += 1;
  return CommissionRule.create({
    name: 'Test 5%',
    version: `test.v${seq}`,
    feeType: 'percentage',
    percentage: 5,
    minFeeETB: 100,
    maxFeeETB: 50000,
    payer: 'buyer',
    categoryIds: [],
    effectiveFrom: new Date('2020-01-01'),
    isActive: true,
    ...overrides,
  });
}
async function setupAcceptedOrder({ ruleOverrides = {} } = {}) {
  await seedRule(ruleOverrides);
  const cat = await Category.create({ name: `Cat${seq}`, slug: `cat-${seq}` });
  const buyer = await createUser('buyer');
  const imp = await approvedImporter();
  const admin = await createUser('admin');
  const bTok = await loginAs(buyer);
  const iTok = await loginAs(imp);
  const aTok = await loginAs(admin);

  const req = await request(app).post('/api/v1/requests')
    .set('Authorization', `Bearer ${bTok}`)
    .send({
      title: 'MacBook Pro 14', description: 'Brand new with warranty',
      category: cat._id.toString(), quantity: 1,
      deliveryCity: 'Addis Ababa',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    console.log('CREATE REQUEST:', req.status, JSON.stringify(req.body, null, 2));
  const publishRes = await request(app)
  .post(`/api/v1/requests/me/${req.body.data?._id}/publish`)
  .set('Authorization', `Bearer ${bTok}`);

console.log(
  'PUBLISH REQUEST:',
  publishRes.status,
  JSON.stringify(publishRes.body, null, 2)
);
  const quote = await request(app)
    .post(`/api/v1/quotations/requests/${req.body.data._id}/quotes`)
    .set('Authorization', `Bearer ${iTok}`)
    .send({
      totalPriceETB: 100000,
      productCondition: 'new',
      estimatedDeliveryDays: 14,
      quotationValidUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });

  const orderRes = await request(app)
    .post(`/api/v1/quotations/${quote.body.data._id}/accept`)
    .set('Authorization', `Bearer ${bTok}`);
    console.log(
  'ACCEPT QUOTATION:',
  orderRes.status,
  JSON.stringify(orderRes.body, null, 2)
);

  return { buyer, imp, admin, bTok, iTok, aTok, orderId: orderRes.body.data._id };
}

// ---------- Tests ----------

describe('Commission snapshot at acceptance', () => {
  test('order stores fee + rule version after acceptance', async () => {
    const { orderId } = await setupAcceptedOrder();
    const order = await Order.findById(orderId);
    expect(order.platformFeeETB).toBe(5000); // 5% of 100000
    expect(order.platformFeePayer).toBe('buyer');
    expect(order.commissionRuleVersion).toMatch(/^test\.v/);

    const record = await CommissionRecord.findOne({ order: orderId });
    expect(record).toBeTruthy();
    expect(record.computedFeeETB).toBe(5000);
    expect(record.revenueState).toBe('pending');
  });

  test('acceptance fails if no active rule matches', async () => {
    // Do NOT seed a rule
    const cat = await Category.create({ name: 'CatX', slug: 'catx' });
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);

    const req = await request(app)
  .post('/api/v1/requests')
  .set('Authorization', `Bearer ${bTok}`)
  .send({
    title: 'MacBook Pro 14',
    description: 'Brand new with warranty',
    category: cat._id.toString(),
    quantity: 1,
    unitOfMeasurement: 'piece',
    deliveryCity: 'Addis Ababa',
    expiresAt: new Date(
      Date.now() + 30 * 24 * 3600 * 1000
    ).toISOString(),
  });
  expect(req.status).toBe(201);
expect(req.body.data?._id).toBeDefined();

const requestId = req.body.data._id;

const publishRes = await request(app)
  .post(`/api/v1/requests/me/${requestId}/publish`)
  .set('Authorization', `Bearer ${bTok}`);

expect(publishRes.status).toBe(200);
      console.log('CREATE REQUEST:', req.status, JSON.stringify(req.body, null, 2));
    await request(app).post(`/api/v1/requests/me/${req.body.data._id}/publish`)
      .set('Authorization', `Bearer ${bTok}`);

      console.log(
  'CREATE REQUEST — NO ACTIVE RULE TEST:',
  req.status,
  JSON.stringify(req.body, null, 2)
);

expect(req.status).toBe(201);
expect(req.body.data?._id).toBeDefined();
    const q = await request(app)
      .post(`/api/v1/quotations/requests/${req.body.data._id}/quotes`)
      .set('Authorization', `Bearer ${iTok}`)
      .send({
        totalPriceETB: 50000, productCondition: 'new', estimatedDeliveryDays: 7,
        quotationValidUntil: new Date(Date.now() + 3600000).toISOString(),
      });

    const res = await request(app)
      .post(`/api/v1/quotations/${q.body.data._id}/accept`)
      .set('Authorization', `Bearer ${bTok}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_COMMISSION_RULE');
  });
});

describe('Payment evidence submission', () => {
  test('buyer fetches instructions', async () => {
    const { bTok, orderId } = await setupAcceptedOrder();
    const res = await request(app).get(`/api/v1/payments/orders/${orderId}/instructions`)
      .set('Authorization', `Bearer ${bTok}`);
    expect(res.status).toBe(200);
    expect(res.body.data.instructions.reference).toBeTruthy();
    expect(res.body.data.instructions.amountETB).toBe(105000); // 100000 + 5000 fee
  });

  test('buyer submits evidence — remains unverified (prompt §13.9)', async () => {
    const { bTok, orderId } = await setupAcceptedOrder();
    const res = await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-ABC123XYZ',
        amountETB: 105000,
        paymentChannel: 'bank_transfer',
        paidAt: new Date().toISOString(),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.isVerified).toBe(false);

    const doc = await PaymentRecord.findById(res.body.data._id);
    expect(doc.isVerified).toBe(false);
    expect(doc.status).toBe('submitted');
  });

  test('buyer cannot submit twice (active record exists)', async () => {
    const { bTok, orderId } = await setupAcceptedOrder();
    await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-AAA', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    const res = await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-BBB', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_ALREADY_SUBMITTED');
  });

  test('duplicate transaction reference blocked across orders', async () => {
    const a = await setupAcceptedOrder();
    const b = await setupAcceptedOrder();
    await request(app).post(`/api/v1/payments/orders/${a.orderId}/submit`)
      .set('Authorization', `Bearer ${a.bTok}`)
      .send({
        transactionReference: 'SAME-REF', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    const res = await request(app).post(`/api/v1/payments/orders/${b.orderId}/submit`)
      .set('Authorization', `Bearer ${b.bTok}`)
      .send({
        transactionReference: 'SAME-REF', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_KEY');
  });
});

describe('Admin payment review', () => {
  test('non-admin cannot verify (prompt §13.10)', async () => {
    const { bTok, orderId } = await setupAcceptedOrder();
    const sub = await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-X', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    const res = await request(app).post(`/api/v1/admin/payments/${sub.body.data._id}/review`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({ action: 'verify' });
    expect(res.status).toBe(403);
  });

  test('admin verify transitions order to payment_condition_satisfied', async () => {
    const { bTok, aTok, orderId } = await setupAcceptedOrder();
    const sub = await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-OK-1', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });

    const res = await request(app).post(`/api/v1/admin/payments/${sub.body.data._id}/review`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({ action: 'verify', note: 'CBE receipt confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('verified');
    expect(res.body.data.isVerified).toBe(true);

    const order = await Order.findById(orderId);
    expect(order.status).toBe('payment_condition_satisfied');
  });

  test('verified payment cannot be verified again (idempotency)', async () => {
    const { bTok, aTok, orderId } = await setupAcceptedOrder();
    const sub = await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-IDEMP', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    await request(app).post(`/api/v1/admin/payments/${sub.body.data._id}/review`)
      .set('Authorization', `Bearer ${aTok}`).send({ action: 'verify' });
    const res = await request(app).post(`/api/v1/admin/payments/${sub.body.data._id}/review`)
      .set('Authorization', `Bearer ${aTok}`).send({ action: 'verify' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_PAYMENT_STATE');
  });

  test('rejected evidence lets buyer resubmit', async () => {
    const { bTok, aTok, orderId } = await setupAcceptedOrder();
    const sub = await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-REJ', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    await request(app).post(`/api/v1/admin/payments/${sub.body.data._id}/review`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({ action: 'reject', rejectionReason: 'Receipt unreadable' });

    const res = await request(app).post(`/api/v1/payments/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        transactionReference: 'TXN-REJ-2', amountETB: 105000,
        paymentChannel: 'bank_transfer', paidAt: new Date().toISOString(),
      });
    expect(res.status).toBe(201);
  });
});

describe('Revenue lifecycle', () => {
  test('admin transitions pending → invoiced → received', async () => {
    const { aTok, orderId } = await setupAcceptedOrder();
    const record = await CommissionRecord.findOne({ order: orderId });

    const r1 = await request(app).post(`/api/v1/admin/commission-records/${record._id}/transition`)
      .set('Authorization', `Bearer ${aTok}`).send({ to: 'invoiced' });
    expect(r1.status).toBe(200);
    expect(r1.body.data.revenueState).toBe('invoiced');

    const r2 = await request(app).post(`/api/v1/admin/commission-records/${record._id}/transition`)
      .set('Authorization', `Bearer ${aTok}`).send({ to: 'received' });
    expect(r2.status).toBe(200);
    expect(r2.body.data.revenueState).toBe('received');
    expect(r2.body.data.receivedAt).toBeTruthy();
  });

  test('invalid revenue transition blocked', async () => {
    const { aTok, orderId } = await setupAcceptedOrder();
    const record = await CommissionRecord.findOne({ order: orderId });
    const res = await request(app).post(`/api/v1/admin/commission-records/${record._id}/transition`)
      .set('Authorization', `Bearer ${aTok}`).send({ to: 'received' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_REVENUE_TRANSITION');
  });

  test('revenue summary separates pending vs received', async () => {
    const { aTok, orderId } = await setupAcceptedOrder();
    const record = await CommissionRecord.findOne({ order: orderId });
    await request(app).post(`/api/v1/admin/commission-records/${record._id}/transition`)
      .set('Authorization', `Bearer ${aTok}`).send({ to: 'invoiced' });
    await request(app).post(`/api/v1/admin/commission-records/${record._id}/transition`)
      .set('Authorization', `Bearer ${aTok}`).send({ to: 'received' });

    const res = await request(app).get('/api/v1/admin/revenue/summary')
      .set('Authorization', `Bearer ${aTok}`);
    expect(res.status).toBe(200);
    expect(res.body.data.received.count).toBe(1);
    expect(res.body.data.received.total).toBe(5000);
    expect(res.body.data.pending.count).toBe(0);
  });
});

describe('Commission rule management', () => {
  test('admin can create and list rules', async () => {
    const admin = await createUser('admin');
    const aTok = await loginAs(admin);
    const res = await request(app).post('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${aTok}`)
      .send({
        name: 'Auto rule',
        version: 'auto.v1',
        feeType: 'percentage',
        percentage: 3,
        payer: 'importer',
        categoryIds: [],
        effectiveFrom: '2026-01-01T00:00:00Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.version).toBe('auto.v1');

    const list = await request(app).get('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${aTok}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
  });

  test('duplicate rule version rejected', async () => {
    const admin = await createUser('admin');
    const aTok = await loginAs(admin);
    const body = {
      name: 'Dup', version: 'dup.v1', feeType: 'percentage', percentage: 2,
      payer: 'buyer', categoryIds: [], effectiveFrom: '2026-01-01T00:00:00Z',
    };
    await request(app).post('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${aTok}`).send(body);
    const res = await request(app).post('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${aTok}`).send(body);
    expect(res.status).toBe(409);
  });

  test('fixed fee is capped by min/max', async () => {
    // 10,000,000 fixed but max 50,000 → fee = 50,000
    const { orderId } = await setupAcceptedOrder({
      ruleOverrides: { feeType: 'fixed', fixedAmountETB: 10000000, percentage: null },
    });
    const order = await Order.findById(orderId);
    expect(order.platformFeeETB).toBe(50000);
  });
});