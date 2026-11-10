
// backend/tests/integration/order.integration.test.js
'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET =
  'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET =
  'test-refresh-secret-12345678901234567890';

const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongoose;
let mongod;
let app;

let User;
let Category;
let ImporterProfile;
let ProductRequest;
let Quotation;
let Order;
let CommissionRule;
let FEE_TYPE;
let PAYER;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({
    binary: { version: '8.0.12' },
    replSet: { count: 1 },
  });

  process.env.MONGO_URI = mongod.getUri('ethio_test_order');

  // Reset modules before loading Mongoose or the application.
  jest.resetModules();

  // Ensure the test and application use the same Mongoose instance.
  mongoose = require('mongoose');

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });

  app = require('../../src/app')();

  ({ CommissionRule, FEE_TYPE, PAYER } =
    require('../../src/modules/commissions/commissionRule.model'));

  ({ User } = require('../../src/modules/users/user.model'));
  ({ Category } = require('../../src/modules/categories/category.model'));
  ({ ImporterProfile } =
    require('../../src/modules/importers/importerProfile.model'));
  ({ ProductRequest } =
    require('../../src/modules/requests/productRequest.model'));
  ({ Quotation } =
    require('../../src/modules/quotations/quotation.model'));
  ({ Order } = require('../../src/modules/orders/order.model'));
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
  if (mongoose?.connection?.db) {
    const collections = await mongoose.connection.db.collections();

    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
});

// ---------- Fixtures ----------

let seq = 0;

async function createUser(role) {
  seq += 1;

  const user = new User({
    fullName: `U${seq}`,
    email: `u${seq}@test.local`,
    phone: `09${String(10000000 + seq).slice(-8)}`,
    role,
  });

  await user.setPassword('StrongPass123');
  await user.save();

  return user;
}

async function loginAs(user) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({
      identifier: user.email,
      password: 'StrongPass123',
    });

  if (response.status !== 200 || !response.body?.data?.tokens?.accessToken) {
    throw new Error(
      `Login failed for ${user.email}: HTTP ${response.status}\n` +
      JSON.stringify(response.body, null, 2)
    );
  }

  return response.body.data.tokens.accessToken;
}

async function approvedImporter() {
  const user = await createUser('importer');

  await ImporterProfile.create({
    user: user._id,
    businessName: `Co ${seq}`,
    verificationStatus: 'approved',
    verifiedAt: new Date(),
    contactPhone: '0911111111',
    contactEmail: `co${seq}@biz.local`,
  });

  return user;
}

async function category() {
  seq += 1;

  return Category.create({
    name: `Cat ${seq}`,
    slug: `cat-${seq}`,
  });
}

async function setupAcceptedOrder() {
  const cat = await category();

  // Create an active global commission rule for this test.
  await CommissionRule.create({
    name: 'Integration Test Commission',
    version: `test-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    feeType: FEE_TYPE.PERCENTAGE,
    percentage: 5,
    payer: PAYER.BUYER,
    categoryIds: [],
    effectiveFrom: new Date(Date.now() - 60_000),
    effectiveUntil: null,
    isActive: true,
    description: 'Commission rule for integration tests',
  });

  const buyer = await createUser('buyer');
  const importer = await approvedImporter();
  const admin = await createUser('admin');

  const buyerToken = await loginAs(buyer);
  const importerToken = await loginAs(importer);
  const adminToken = await loginAs(admin);

  const productRequest = await request(app)
    .post('/api/v1/requests')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({
      title: 'MacBook Pro 14',
      description: 'Brand new with warranty',
      category: cat._id.toString(),
      quantity: 1,
      deliveryCity: 'Addis Ababa',
      expiresAt: new Date(
        Date.now() + 30 * 24 * 3600 * 1000
      ).toISOString(),
    });

  if (productRequest.status !== 201 || !productRequest.body?.data?._id) {
    throw new Error(
      `Request creation failed: HTTP ${productRequest.status}\n` +
      JSON.stringify(productRequest.body, null, 2)
    );
  }

  const publishResponse = await request(app)
    .post(`/api/v1/requests/me/${productRequest.body.data._id}/publish`)
    .set('Authorization', `Bearer ${buyerToken}`);

  if (
    publishResponse.status < 200 ||
    publishResponse.status >= 300
  ) {
    throw new Error(
      `Request publishing failed: HTTP ${publishResponse.status}\n` +
      JSON.stringify(publishResponse.body, null, 2)
    );
  }

  const quotation = await request(app)
    .post(
      `/api/v1/quotations/requests/${productRequest.body.data._id}/quotes`
    )
    .set('Authorization', `Bearer ${importerToken}`)
    .send({
      totalPriceETB: 120000,
      productCondition: 'new',
      estimatedDeliveryDays: 14,
      quotationValidUntil: new Date(
        Date.now() + 7 * 24 * 3600 * 1000
      ).toISOString(),
    });

  if (quotation.status !== 201 || !quotation.body?.data?._id) {
    throw new Error(
      `Quotation creation failed: HTTP ${quotation.status}\n` +
      JSON.stringify(quotation.body, null, 2)
    );
  }

  const orderResponse = await request(app)
    .post(`/api/v1/quotations/${quotation.body.data._id}/accept`)
    .set('Authorization', `Bearer ${buyerToken}`);

  if (orderResponse.status !== 201 || !orderResponse.body?.data?._id) {
    throw new Error(
      `Order acceptance failed: HTTP ${orderResponse.status}\n` +
      JSON.stringify(orderResponse.body, null, 2)
    );
  }

  return {
    buyer,
    imp: importer,
    admin,
    bTok: buyerToken,
    iTok: importerToken,
    aTok: adminToken,
    order: orderResponse.body.data,
    orderId: orderResponse.body.data._id,
  };
}

// ---------- Order access control ----------

describe('Order access control', () => {
  test('buyer sees own order with importer contact', async () => {
    const { bTok, orderId } = await setupAcceptedOrder();

    const response = await request(app)
      .get(`/api/v1/orders/me/${orderId}`)
      .set('Authorization', `Bearer ${bTok}`);

    expect(response.status).toBe(200);
    expect(response.body.data.counterparty.role).toBe('importer');
    expect(response.body.data.counterparty.businessName).toContain('Co ');
    expect(response.body.data.counterparty.phone).toBeTruthy();
  });

  test('importer sees own order with buyer contact', async () => {
    const { iTok, orderId } = await setupAcceptedOrder();

    const response = await request(app)
      .get(`/api/v1/orders/me/${orderId}`)
      .set('Authorization', `Bearer ${iTok}`);

    expect(response.status).toBe(200);
    expect(response.body.data.counterparty.role).toBe('buyer');
    expect(response.body.data.counterparty.phone).toBeTruthy();
  });

  test('unrelated buyer cannot access order', async () => {
    const { orderId } = await setupAcceptedOrder();
    const stranger = await createUser('buyer');
    const strangerToken = await loginAs(stranger);

    const response = await request(app)
      .get(`/api/v1/orders/me/${orderId}`)
      .set('Authorization', `Bearer ${strangerToken}`);

    expect(response.status).toBe(403);
  });

  test('list mine returns only own orders', async () => {
    const { bTok } = await setupAcceptedOrder();
    await setupAcceptedOrder();

    const response = await request(app)
      .get('/api/v1/orders/me?page=1&limit=10')
      .set('Authorization', `Bearer ${bTok}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  },20000);
});

// ---------- Order state transitions ----------

describe('Order state transitions', () => {
  test(
    'invalid transition rejected with INVALID_STATE_TRANSITION (prompt §13.11)',
    async () => {
      const { iTok, orderId } = await setupAcceptedOrder();

      const response = await request(app)
        .post(`/api/v1/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${iTok}`)
        .send({ action: 'importer_mark_shipped' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(response.body.error.details).toEqual({
        from: 'awaiting_payment_confirmation',
        to: 'import_shipment_in_progress',
      });
    }
  );

  test('buyer cannot perform importer-side transition', async () => {
    const { bTok, orderId } = await setupAcceptedOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({ action: 'importer_mark_shipped' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_ALLOWED');
  });

  test('importer cannot start processing before payment satisfied', async () => {
    const { iTok, orderId } = await setupAcceptedOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${iTok}`)
      .send({ action: 'importer_start_processing' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_NOT_SATISFIED');
  });

  
  test('ordinary cancellation is blocked after payment condition is satisfied', async () => {
    const { aTok, bTok, orderId } = await setupAcceptedOrder();

    const paymentResponse = await request(app)
      .post(`/api/v1/admin/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({
        to: 'payment_condition_satisfied',
        note: 'Test fixture only; no actual payment made',
      });

    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.data.status).toBe('payment_condition_satisfied');

    const cancelResponse = await request(app)
      .post(`/api/v1/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        action: 'buyer_cancel',
        note: 'Regression test only',
      });

    expect(cancelResponse.status).toBe(409);
    expect(cancelResponse.body.error.code).toBe('CANCELLATION_REQUIRES_ADMIN');

    const order = await Order.findById(orderId);
    expect(order.status).toBe('payment_condition_satisfied');
  });

  test('admin transition to PAYMENT_SATISFIED unblocks importer', async () => {
    const { aTok, iTok, orderId } = await setupAcceptedOrder();

    const adminResponse = await request(app)
      .post(`/api/v1/admin/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({
        to: 'payment_condition_satisfied',
        note: 'Payment verified',
      });

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.status).toBe('payment_condition_satisfied');

    const startResponse = await request(app)
      .post(`/api/v1/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${iTok}`)
      .send({ action: 'importer_start_processing' });

    expect(startResponse.status).toBe(200);
    expect(startResponse.body.data.status).toBe('processing');
  });

  test(
    'happy path to COMPLETED increments importer order count and fulfills request',
    async () => {
      const { aTok, iTok, bTok, orderId, imp } =
        await setupAcceptedOrder();

      const paymentResponse = await request(app)
        .post(`/api/v1/admin/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${aTok}`)
        .send({ to: 'payment_condition_satisfied' });

      expect(paymentResponse.status).toBe(200);

      const actions = [
        'importer_start_processing',
        'importer_mark_shipped',
        'importer_mark_in_transit',
        'importer_mark_ready',
        'importer_mark_delivered',
      ];

      for (const action of actions) {
        // eslint-disable-next-line no-await-in-loop
        const response = await request(app)
          .post(`/api/v1/orders/${orderId}/transition`)
          .set('Authorization', `Bearer ${iTok}`)
          .send({ action });

        expect(response.status).toBe(200);
      }

      const completeResponse = await request(app)
        .post(`/api/v1/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${bTok}`)
        .send({ action: 'buyer_confirm_receipt' });

      expect(completeResponse.status).toBe(200);
      expect(completeResponse.body.data.status).toBe('completed');

      const profile = await ImporterProfile.findOne({ user: imp._id });
      expect(profile.completedOrdersCount).toBe(1);

      const requestDoc = await ProductRequest.findOne({
        acceptedQuotationId: { $exists: true },
      });

      expect(requestDoc.status).toBe('fulfilled');
    }
  );

  test(
    'disputed order cannot be completed through ordinary action (prompt §13.12)',
    async () => {
      const { aTok, orderId } = await setupAcceptedOrder();

      const disputeResponse = await request(app)
        .post(`/api/v1/admin/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${aTok}`)
        .send({
          to: 'disputed',
          note: 'Buyer reported damage',
        });

      expect(disputeResponse.status).toBe(200);

      const response = await request(app)
        .post(`/api/v1/admin/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${aTok}`)
        .send({ to: 'completed' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    }
  );

  test('buyer_cancel from awaiting_payment succeeds', async () => {
    const { bTok, orderId } = await setupAcceptedOrder();

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${bTok}`)
      .send({
        action: 'buyer_cancel',
        note: 'Changed mind',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('cancelled');
  });

  test('importer cannot access another importer\'s order', async () => {
    const { orderId } = await setupAcceptedOrder();
    const otherImporter = await approvedImporter();
    const otherImporterToken = await loginAs(otherImporter);

    const response = await request(app)
      .get(`/api/v1/orders/me/${orderId}`)
      .set('Authorization', `Bearer ${otherImporterToken}`);

    expect(response.status).toBe(403);
  });
});

// ---------- Admin oversight ----------

describe('Admin oversight', () => {
  test('admin can list orders and view with both sides', async () => {
    const { aTok } = await setupAcceptedOrder();

    const listResponse = await request(app)
      .get('/api/v1/admin/orders?page=1&limit=10')
      .set('Authorization', `Bearer ${aTok}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const orderId = listResponse.body.data[0]._id;

    const detailResponse = await request(app)
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${aTok}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.buyerInfo).toBeTruthy();
    expect(detailResponse.body.data.importerInfo).toBeTruthy();
  });

  test('non-admin cannot access admin order routes', async () => {
    const { bTok } = await setupAcceptedOrder();

    const response = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${bTok}`);

    expect(response.status).toBe(403);
  });
});







