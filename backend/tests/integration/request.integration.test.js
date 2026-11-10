// backend/tests/integration/request.integration.test.js
'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345678901234567890';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongod; let app;
let User; let Category; let ImporterProfile; let ProductRequest;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });

  process.env.MONGO_URI = mongod.getUri('ethio_test_request');

  await mongoose.connect(process.env.MONGO_URI);

  app = require('../../src/app')();
  // eslint-disable-next-line global-require
  ({ User } = require('../../src/modules/users/user.model'));
  // eslint-disable-next-line global-require
  ({ Category } = require('../../src/modules/categories/category.model'));
  // eslint-disable-next-line global-require
  ({ ImporterProfile } = require('../../src/modules/importers/importerProfile.model'));
  // eslint-disable-next-line global-require
  ({ ProductRequest } = require('../../src/modules/requests/productRequest.model'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const cols = await mongoose.connection.db.collections();
  for (const c of cols) await c.deleteMany({});
});

// ---- Fixtures ----

let seq = 0;
async function createUser(role) {
  seq += 1;
  const u = new User({
    fullName: `U${seq}`,
    email: `u${seq}@test.local`,
    phone: `09${String(10000000 + seq).slice(-8)}`,
    role,
  });
  await u.setPassword('StrongPass123');
  await u.save();
  return u;
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: user.email, password: 'StrongPass123' });
  return res.body.data.tokens.accessToken;
}

async function createCategory(name, overrides = {}) {
  return Category.create({
    name, slug: name.toLowerCase().replace(/\s+/g, '-'), ...overrides,
  });
}

async function approveImporter(importer) {
  await ImporterProfile.create({
    user: importer._id,
    businessName: `Importer ${importer._id}`,
    verificationStatus: 'approved',
    verifiedAt: new Date(),
  });
}

function baseRequest(overrides = {}) {
  return {
    title: 'MacBook Pro 14 M3',
    description: 'Looking for brand new sealed unit with warranty',
    category: null,
    quantity: 1,
    deliveryCity: 'Addis Ababa',
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

// ---- Tests ----

describe('Request creation & ownership', () => {
  test('buyer creates a draft request', async () => {
    const cat = await createCategory('Electronics');
    const buyer = await createUser('buyer');
    const token = await loginAs(buyer);

    const res = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${token}`)
      .send(baseRequest({ category: cat._id.toString() }));

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.referenceNumber).toMatch(/^REQ-\d{8}-[A-Z0-9]{6}$/);
  });

  test('rejects when category is inactive', async () => {
    const cat = await createCategory('Old', { isActive: false });
    const buyer = await createUser('buyer');
    const token = await loginAs(buyer);
    const res = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${token}`)
      .send(baseRequest({ category: cat._id.toString() }));
    expect(res.status).toBe(400);
  });

  test('rejects expired expiresAt', async () => {
    const cat = await createCategory('Cat');
    const buyer = await createUser('buyer');
    const token = await loginAs(buyer);
    const res = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${token}`)
      .send(baseRequest({
        category: cat._id.toString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }));
    expect(res.status).toBe(400);
  });

  test('buyer cannot edit another buyer\'s request (prompt §13.3)', async () => {
    const cat = await createCategory('Cat');
    const buyerA = await createUser('buyer');
    const buyerB = await createUser('buyer');
    const tokenA = await loginAs(buyerA);
    const tokenB = await loginAs(buyerB);

    const created = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(baseRequest({ category: cat._id.toString() }));

    const res = await request(app).patch(`/api/v1/requests/me/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Hijack' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_OWNER');
  });
});

describe('Publish & cancel', () => {
  test('publish moves draft → published', async () => {
    const cat = await createCategory('Cat');
    const buyer = await createUser('buyer');
    const token = await loginAs(buyer);
    const created = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${token}`)
      .send(baseRequest({ category: cat._id.toString() }));

    const res = await request(app)
      .post(`/api/v1/requests/me/${created.body.data._id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('published');
    expect(res.body.data.publishedAt).toBeTruthy();
  });

  test('cannot publish an already-published request', async () => {
    const cat = await createCategory('Cat');
    const buyer = await createUser('buyer');
    const token = await loginAs(buyer);
    const created = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${token}`)
      .send(baseRequest({ category: cat._id.toString() }));
    await request(app).post(`/api/v1/requests/me/${created.body.data._id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .post(`/api/v1/requests/me/${created.body.data._id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  test('buyer cancels published request', async () => {
    const cat = await createCategory('Cat');
    const buyer = await createUser('buyer');
    const token = await loginAs(buyer);
    const created = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${token}`)
      .send(baseRequest({ category: cat._id.toString() }));
    await request(app).post(`/api/v1/requests/me/${created.body.data._id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/v1/requests/me/${created.body.data._id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Changed mind' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });
});

describe('Importer discovery & privacy', () => {
  test('unapproved importer cannot browse (prompt §13.1 gate)', async () => {
    const importer = await createUser('importer');
    // No ImporterProfile or non-approved
    await ImporterProfile.create({
      user: importer._id, businessName: 'Pending Co', verificationStatus: 'pending',
    });
    const token = await loginAs(importer);
    const res = await request(app).get('/api/v1/requests/browse')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('IMPORTER_NOT_APPROVED');
  });

  test('approved importer sees only published/active requests', async () => {
    const cat = await createCategory('Cat');
    const buyer = await createUser('buyer');
    const importer = await createUser('importer');
    await approveImporter(importer);
    const buyerToken = await loginAs(buyer);
    const impToken = await loginAs(importer);

    // Draft — should not be visible
    await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(baseRequest({ category: cat._id.toString(), title: 'Draft Only' }));

    // Published — should be visible
    const pub = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(baseRequest({ category: cat._id.toString(), title: 'Visible One' }));
    await request(app).post(`/api/v1/requests/me/${pub.body.data._id}/publish`)
      .set('Authorization', `Bearer ${buyerToken}`);

    const res = await request(app).get('/api/v1/requests/browse')
      .set('Authorization', `Bearer ${impToken}`);
    expect(res.status).toBe(200);
    const titles = res.body.data.map((r) => r.title);
    expect(titles).toContain('Visible One');
    expect(titles).not.toContain('Draft Only');
  });

  test('discovery projection excludes buyer PII and deliveryAddress (prompt §13.8)', async () => {
    const cat = await createCategory('Cat');
    const buyer = await createUser('buyer');
    const importer = await createUser('importer');
    await approveImporter(importer);
    const buyerToken = await loginAs(buyer);
    const impToken = await loginAs(importer);

    const created = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(baseRequest({
        category: cat._id.toString(),
        deliveryAddress: 'Secret Street 42',
      }));
    await request(app).post(`/api/v1/requests/me/${created.body.data._id}/publish`)
      .set('Authorization', `Bearer ${buyerToken}`);

    const res = await request(app).get('/api/v1/requests/browse')
      .set('Authorization', `Bearer ${impToken}`);
    const item = res.body.data.find((r) => r.title === 'MacBook Pro 14 M3');
    expect(item).toBeTruthy();
    expect(item.buyer).toBeUndefined();
    expect(item.deliveryAddress).toBeUndefined();
    expect(item.adminNote).toBeUndefined();
    expect(item.statusHistory).toBeUndefined();
    // deliveryCity is safe to expose
    expect(item.deliveryCity).toBe('Addis Ababa');
  });

  test('restricted categories hidden from discovery', async () => {
    const cat = await createCategory('Restricted', { isRestricted: true });
    const buyer = await createUser('buyer');
    const importer = await createUser('importer');
    await approveImporter(importer);
    const buyerToken = await loginAs(buyer);
    const impToken = await loginAs(importer);

    const created = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(baseRequest({ category: cat._id.toString(), title: 'Hidden Restricted' }));
    await request(app).post(`/api/v1/requests/me/${created.body.data._id}/publish`)
      .set('Authorization', `Bearer ${buyerToken}`);

    const res = await request(app).get('/api/v1/requests/browse')
      .set('Authorization', `Bearer ${impToken}`);
    const titles = res.body.data.map((r) => r.title);
    expect(titles).not.toContain('Hidden Restricted');
  });

  test('filter by city works', async () => {
    const cat = await createCategory('Cat');
    const buyer = await createUser('buyer');
    const importer = await createUser('importer');
    await approveImporter(importer);
    const buyerToken = await loginAs(buyer);
    const impToken = await loginAs(importer);

    const a = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(baseRequest({ category: cat._id.toString(), title: 'Addis Item' }));
    await request(app).post(`/api/v1/requests/me/${a.body.data._id}/publish`)
      .set('Authorization', `Bearer ${buyerToken}`);

    const b = await request(app).post('/api/v1/requests')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(baseRequest({
        category: cat._id.toString(), title: 'Bahir Item', deliveryCity: 'Bahir Dar',
      }));
    await request(app).post(`/api/v1/requests/me/${b.body.data._id}/publish`)
      .set('Authorization', `Bearer ${buyerToken}`);

    const res = await request(app).get('/api/v1/requests/browse?city=Addis%20Ababa')
      .set('Authorization', `Bearer ${impToken}`);
    expect(res.body.data.every((r) => r.deliveryCity === 'Addis Ababa')).toBe(true);
  });

  test('buyer role cannot access importer browse', async () => {
    const buyer = await createUser('buyer');
    const token = await loginAs(buyer);
    const res = await request(app).get('/api/v1/requests/browse')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('List mine', () => {
  
test('buyer sees only their own requests with pagination', async () => {
  const cat = await createCategory('Cat');
  const buyerA = await createUser('buyer');
  const buyerB = await createUser('buyer');
  const aToken = await loginAs(buyerA);
  const bToken = await loginAs(buyerB);

  const a1 = await request(app)
    .post('/api/v1/requests')
    .set('Authorization', `Bearer ${aToken}`)
    .send(baseRequest({
      category: cat._id.toString(),
      title: 'MacBook Pro Request A',
    }));

  const b1 = await request(app)
    .post('/api/v1/requests')
    .set('Authorization', `Bearer ${bToken}`)
    .send(baseRequest({
      category: cat._id.toString(),
      title: 'Samsung Galaxy Request B',
    }));

  // Confirm both requests were created successfully.
  // Debug request creation before asserting.
console.log('BUYER A CREATE:', a1.status, JSON.stringify(a1.body, null, 2));
console.log('BUYER B CREATE:', b1.status, JSON.stringify(b1.body, null, 2));

// Confirm both requests were created successfully.
expect(a1.status).toBe(201);
expect(b1.status).toBe(201);

  // Confirm the requests are stored in the database.
  const savedRequests = await ProductRequest.find({})
    .select('title buyer status')
    .lean();

  console.log('SAVED REQUESTS:', savedRequests);

  // Get buyer A's requests.
  const res = await request(app)
    .get('/api/v1/requests/me?page=1&limit=10')
    .set('Authorization', `Bearer ${aToken}`);

  console.log('LIST MINE RESPONSE:', JSON.stringify(res.body, null, 2));

  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(1);
  expect(res.body.data[0].title).toBe('MacBook Pro Request A');
  expect(res.body.meta.pagination.total).toBe(1);
});

});