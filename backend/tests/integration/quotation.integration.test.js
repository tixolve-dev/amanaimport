// backend/tests/integration/quotation.integration.test.js
'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345678901234567890';

const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongoose;
let mongod; let app;
let User; let Category; let ImporterProfile; let ProductRequest;
let Quotation; let Order; let CommissionRule;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({
    binary: { version: '8.0.12' },
    replSet: { count: 1 },
  });

  process.env.MONGO_URI = mongod.getUri('ethio_test_quotation');

  // Load a fresh Mongoose instance and application after setting the test URI.
  jest.resetModules();
  mongoose = require('mongoose');

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });

  app = require('../../src/app')();

  ({ User } = require('../../src/modules/users/user.model'));
  ({ Category } = require('../../src/modules/categories/category.model'));
  ({ ImporterProfile } = require('../../src/modules/importers/importerProfile.model'));
  ({ ProductRequest } = require('../../src/modules/requests/productRequest.model'));
  ({ Quotation } = require('../../src/modules/quotations/quotation.model'));
  ({ Order } = require('../../src/modules/orders/order.model'));
  ({ CommissionRule } = require('../../src/modules/commissions/commissionRule.model'));
}, 60000);

afterAll(async () => {
  if (mongoose) {
    await mongoose.disconnect();
  }

  if (mongod) {
    await mongod.stop();
  }
}, 60000);

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
    contactPhone: '0911111111', contactEmail: `co${seq}@biz.local`,
  });
  return u;
}
async function unapprovedImporter() {
  const u = await createUser('importer');
  await ImporterProfile.create({
    user: u._id, businessName: `Pending ${seq}`, verificationStatus: 'pending',
  });
  return u;
}
async function category() {
  seq += 1;
  return Category.create({ name: `Cat ${seq}`, slug: `cat-${seq}` });
}
async function createCommissionRule(categoryId = null) {
  return CommissionRule.create({
    name: 'Integration Test Commission',
    version: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    feeType: 'percentage',
    percentage: 5,
    payer: 'buyer',
    categoryIds: categoryId ? [categoryId] : [],
    effectiveFrom: new Date(Date.now() - 60_000),
    effectiveUntil: null,
    isActive: true,
  });
}
async function publishedRequest(buyerToken, categoryId) {
  const r = await request(app).post('/api/v1/requests')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({
      title: 'MacBook Pro 14', description: 'Brand new with warranty',
      category: categoryId.toString(), quantity: 1,
      deliveryCity: 'Addis Ababa',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
  await request(app)
    .post(`/api/v1/requests/me/${r.body.data._id}/publish`)
    .set('Authorization', `Bearer ${buyerToken}`);
  return r.body.data._id;
}
function quoteBody(overrides = {}) {
  return {
    totalPriceETB: 120000,
    itemizedCosts: [
      { label: 'Product', amountETB: 100000 },
      { label: 'Shipping', amountETB: 15000 },
      { label: 'Customs', amountETB: 5000, note: 'estimate' },
    ],
    productCondition: 'new',
    specifications: 'M3 Pro, 18GB, 512GB',
    warrantyOffered: '12 months',
    returnPolicy: '14 days',
    estimatedDeliveryDays: 14,
    quotationValidUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    notes: 'Genuine Apple, sealed',
    ...overrides,
  };
}

// ---------- Tests ----------

describe('Quotation submission', () => {
  test('unapproved importer cannot quote (prompt §13.1)', async () => {
    const cat = await category();
    await createCommissionRule(cat._id);
    const buyer = await createUser('buyer');
    const imp = await unapprovedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    const res = await request(app)
      .post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`)
      .send(quoteBody());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('IMPORTER_NOT_APPROVED');
  });

  test('approved importer submits valid quotation (prompt §13.2)', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    const res = await request(app)
      .post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`)
      .send(quoteBody());
      console.log('ACCEPTANCE STATUS:', res.status);
console.log('ACCEPTANCE ERROR:', JSON.stringify(res.body, null, 2));

//expect(res.status).toBe(201);
    expect(res.status).toBe(201);
    if (res.status !== 201) {
  console.log('ACCEPTANCE ERROR:', JSON.stringify(res.body, null, 2));
}
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.referenceNumber).toMatch(/^QTE-/);
    expect(res.body.data.totalPriceETB).toBe(120000);
  });

  test('one quotation per importer per request', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());
    const dup = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('QUOTE_EXISTS');
  });

  test('rejects invalid quotationValidUntil (past)', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    const res = await request(app)
      .post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`)
      .send(quoteBody({ quotationValidUntil: new Date(Date.now() - 1000).toISOString() }));
    expect(res.status).toBe(400);
  });

  test('first quotation moves request to receiving_offers', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    const reqDoc = await ProductRequest.findById(reqId);
    expect(reqDoc.status).toBe('receiving_offers');
    expect(reqDoc.quotationsCount).toBe(1);
  });

  test('cannot quote on an expired request', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    // Force expiry directly
    await ProductRequest.updateOne({ _id: reqId }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app)
      .post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_EXPIRED');
  });
});

describe('Edit / withdraw', () => {
  test('importer edits own submitted quote → status becomes updated', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    const created = await request(app)
      .post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    const res = await request(app)
      .patch(`/api/v1/quotations/${created.body.data._id}`)
      .set('Authorization', `Bearer ${iTok}`)
      .send({ totalPriceETB: 110000 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('updated');
    expect(res.body.data.totalPriceETB).toBe(110000);
  });

  test('importer cannot edit accepted quotation', async () => {
    const cat = await category();
    await createCommissionRule(cat._id);
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    const created = await request(app)
      .post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    await request(app)
      .post(`/api/v1/quotations/${created.body.data._id}/accept`)
      .set('Authorization', `Bearer ${bTok}`);

    const res = await request(app)
      .patch(`/api/v1/quotations/${created.body.data._id}`)
      .set('Authorization', `Bearer ${iTok}`)
      .send({ totalPriceETB: 99000 });
    expect(res.status).toBe(409);
  });

  test('withdraw sets status and decrements request quotation count', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);

    const created = await request(app)
      .post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    await request(app)
      .post(`/api/v1/quotations/${created.body.data._id}/withdraw`)
      .set('Authorization', `Bearer ${iTok}`).send({ reason: 'Stock unavailable' });

    const reqDoc = await ProductRequest.findById(reqId);
    expect(reqDoc.quotationsCount).toBe(0);
    const q = await Quotation.findById(created.body.data._id);
    expect(q.status).toBe('withdrawn');
  });
});

describe('Buyer comparison & contact privacy', () => {
  test('buyer sees competing offers and NO importer contact pre-accept (prompt §13.4, §13.8)', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const i1 = await approvedImporter();
    const i2 = await approvedImporter();
    const bTok = await loginAs(buyer);
    const i1Tok = await loginAs(i1);
    const i2Tok = await loginAs(i2);
    const reqId = await publishedRequest(bTok, cat._id);

    await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${i1Tok}`).send(quoteBody({ totalPriceETB: 120000 }));
    await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${i2Tok}`).send(quoteBody({ totalPriceETB: 115000 }));

    const res = await request(app)
      .get(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${bTok}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    // Sorted by price ascending
    expect(res.body.data[0].totalPriceETB).toBe(115000);
    // No importer userId or contact leaked
    for (const q of res.body.data) {
      expect(q.importerUser).toBeUndefined();
      expect(q.contact).toBeUndefined();
      expect(q.snapshot).toBeNull();
      expect(q.importerProfile.contactPhone).toBeUndefined();
      expect(q.importerProfile.contactEmail).toBeUndefined();
    }
  });

  test('non-owner buyer cannot list quotations for a request', async () => {
    const cat = await category();
    const buyerA = await createUser('buyer');
    const buyerB = await createUser('buyer');
    const imp = await approvedImporter();
    const bATok = await loginAs(buyerA);
    const bBTok = await loginAs(buyerB);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bATok, cat._id);
    await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    const res = await request(app)
      .get(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${bBTok}`);
    expect(res.status).toBe(403);
  });
});

describe('Acceptance → order handoff (atomic)', () => {
  test('accept creates exactly one order and rejects competing quotes (prompt §13.5)', async () => {
  const cat = await category();
  await createCommissionRule(cat._id);
  const buyer = await createUser('buyer');
    const i1 = await approvedImporter();
    const i2 = await approvedImporter();
    const bTok = await loginAs(buyer);
    const i1Tok = await loginAs(i1);
    const i2Tok = await loginAs(i2);
    const reqId = await publishedRequest(bTok, cat._id);

    const q1 = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${i1Tok}`).send(quoteBody({ totalPriceETB: 120000 }));
    const q2 = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${i2Tok}`).send(quoteBody({ totalPriceETB: 115000 }));

    const res = await request(app)
      .post(`/api/v1/quotations/${q2.body.data._id}/accept`)
      .set('Authorization', `Bearer ${bTok}`);
console.log('ACCEPT STATUS:', res.status);
console.log('ACCEPT BODY:', JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(201);
    expect(res.body.data.referenceNumber).toMatch(/^ORD-/);
    expect(res.body.data.status).toBe('awaiting_payment_confirmation');
    expect(res.body.data.totalPriceETB).toBe(115000);

    // The other quotation is now rejected
    const rejected = await Quotation.findById(q1.body.data._id);
    expect(rejected.status).toBe('rejected');

    // Request is offer_selected
    const reqDoc = await ProductRequest.findById(reqId);
    expect(reqDoc.status).toBe('offer_selected');

    // Exactly one order exists
    const orderCount = await Order.countDocuments({ request: reqId });
    expect(orderCount).toBe(1);
  });

  test('two simultaneous accept calls → only one order (prompt §13.6)', async () => {
    const cat = await category();
    await createCommissionRule(cat._id);
    const buyer = await createUser('buyer');
    const i1 = await approvedImporter();
    const i2 = await approvedImporter();
    const bTok = await loginAs(buyer);
    const i1Tok = await loginAs(i1);
    const i2Tok = await loginAs(i2);
    const reqId = await publishedRequest(bTok, cat._id);

    const q1 = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${i1Tok}`).send(quoteBody());
    const q2 = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${i2Tok}`).send(quoteBody());

    // Fire concurrently
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/v1/quotations/${q1.body.data._id}/accept`)
        .set('Authorization', `Bearer ${bTok}`),
      request(app).post(`/api/v1/quotations/${q2.body.data._id}/accept`)
        .set('Authorization', `Bearer ${bTok}`),
    ]);

    const ok = [r1.status, r2.status].filter((s) => s === 201).length;
    const conflict = [r1.status, r2.status].filter((s) => s === 409).length;
    expect(ok).toBe(1);
    expect(conflict).toBe(1);

    const orderCount = await Order.countDocuments({ request: reqId });
    expect(orderCount).toBe(1);
  });

  test('non-owner buyer cannot accept a quotation', async () => {
    const cat = await category();
    await createCommissionRule(cat._id);
    const buyerA = await createUser('buyer');
    const buyerB = await createUser('buyer');
    const imp = await approvedImporter();
    const bATok = await loginAs(buyerA);
    const bBTok = await loginAs(buyerB);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bATok, cat._id);
    const q = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    const res = await request(app)
      .post(`/api/v1/quotations/${q.body.data._id}/accept`)
      .set('Authorization', `Bearer ${bBTok}`);
    expect(res.status).toBe(403);
  });

  test('cannot accept expired quotation', async () => {
    const cat = await category();
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);
    const q = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    await Quotation.updateOne(
      { _id: q.body.data._id },
      { quotationValidUntil: new Date(Date.now() - 1000) },
    );

    const res = await request(app)
      .post(`/api/v1/quotations/${q.body.data._id}/accept`)
      .set('Authorization', `Bearer ${bTok}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_EXPIRED');
  });

  test('order snapshot preserves agreed terms immutably', async () => {
    const cat = await category();
    await createCommissionRule(cat._id);
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);
    const q = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody({ totalPriceETB: 119999 }));

    const res = await request(app)
      .post(`/api/v1/quotations/${q.body.data._id}/accept`)
      .set('Authorization', `Bearer ${bTok}`);
    expect(res.status).toBe(201);

    const order = await Order.findById(res.body.data._id);
    expect(order.snapshot.totalPriceETB).toBeUndefined(); // snapshot has no totalPriceETB field, only itemizedCosts
    expect(order.snapshot.itemizedCosts.length).toBe(3);
    expect(order.totalPriceETB).toBe(119999);
    expect(order.snapshot.title).toBe('MacBook Pro 14');
    expect(order.snapshot.importerBusinessName).toContain('Co ');
  });

  test('buyer sees importer contact only on accepted quotation (prompt §13.8)', async () => {
    const cat = await category();
    await createCommissionRule(cat._id);
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const reqId = await publishedRequest(bTok, cat._id);
    const q = await request(app).post(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${iTok}`).send(quoteBody());

    await request(app)
      .post(`/api/v1/quotations/${q.body.data._id}/accept`)
      .set('Authorization', `Bearer ${bTok}`);

    const res = await request(app)
      .get(`/api/v1/quotations/requests/${reqId}/quotes`)
      .set('Authorization', `Bearer ${bTok}`);
    const accepted = res.body.data.find((x) => x._id === q.body.data._id);
    expect(accepted.contact).toBeTruthy();
    expect(accepted.contact.contactPhone).toBe('0911111111');
    expect(accepted.contact.businessName).toContain('Co ');
  });
});