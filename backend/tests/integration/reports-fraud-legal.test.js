// backend/tests/integration/reports-fraud-legal.test.js
'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345678901234567890';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongod; let app;
let User; let FraudReport; let LegalChecklistItem; let AuditLog;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });

  process.env.MONGO_URI = mongod.getUri('ethio_test_reports');

  await mongoose.connect(process.env.MONGO_URI);

  app = require('../../src/app')();

  ({ User } = require('../../src/modules/users/user.model'));
  ({ FraudReport } = require('../../src/modules/admin/fraudReport.model'));
  ({ LegalChecklistItem } = require('../../src/modules/admin/legalChecklist.model'));
  ({ AuditLog } = require('../../src/modules/admin/auditLog.model'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const cols = await mongoose.connection.db.collections();
  for (const c of cols) await c.deleteMany({});
});

let seq = 0;
async function createUser(role) {
  seq += 1;
  const u = new User({ fullName: `U${seq}`, email: `u${seq}@t.local`, phone: `09${String(10000000 + seq).slice(-8)}`, role });
  await u.setPassword('StrongPass123');
  await u.save();
  return u;
}
async function loginAs(u) {
  const r = await request(app).post('/api/v1/auth/login').send({ identifier: u.email, password: 'StrongPass123' });
  return r.body.data.tokens.accessToken;
}

describe('Reports', () => {
  test('admin can fetch summary', async () => {
    const admin = await createUser('admin');
    const aTok = await loginAs(admin);
    const res = await request(app).get('/api/v1/admin/reports/summary')
      .set('Authorization', `Bearer ${aTok}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('requests');
    expect(res.body.data).toHaveProperty('revenue');
  });

  test('non-admin blocked', async () => {
    const buyer = await createUser('buyer');
    const bTok = await loginAs(buyer);
    const res = await request(app).get('/api/v1/admin/reports/summary')
      .set('Authorization', `Bearer ${bTok}`);
    expect(res.status).toBe(403);
  });
});

describe('Fraud reports', () => {
  test('anyone can submit', async () => {
    const res = await request(app).post('/api/v1/fraud-reports')
      .send({ category: 'suspected_fraud', description: 'Importer asked me to pay outside the app' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('open');
  });

  test('admin can triage and audit is recorded', async () => {
    const admin = await createUser('admin');
    const aTok = await loginAs(admin);
    const r = await request(app).post('/api/v1/fraud-reports')
      .send({ category: 'payment_scam', description: 'Receipt shown is suspicious' });
    const id = r.body.data._id;
    const upd = await request(app).patch(`/api/v1/admin/fraud-reports/${id}`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({ status: 'investigating', notes: 'Looking into it' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.status).toBe('investigating');

    const audit = await AuditLog.findOne({ action: 'fraud.investigating' });
    expect(audit).toBeTruthy();
    expect(audit.targetId.toString()).toBe(id);
  });
});

describe('Legal checklist', () => {
  test('admin can seed + read + update', async () => {
    const admin = await createUser('admin');
    const aTok = await loginAs(admin);

    await LegalChecklistItem.create({
      item: 'payments.manual_arrangement',
      label: 'Manual payment reviewed',
      category: 'payment_licensing',
      gatesCapability: 'payments.manual_enabled',
      status: 'not_started',
    });

    const list = await request(app).get('/api/v1/admin/legal-checklist')
      .set('Authorization', `Bearer ${aTok}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);

    const upd = await request(app).patch('/api/v1/admin/legal-checklist/payments.manual_arrangement')
      .set('Authorization', `Bearer ${aTok}`)
      .send({ status: 'in_review', notes: 'Draft sent to lawyer' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.status).toBe('in_review');
    expect(upd.body.data.reviewedBy.toString()).toBe(admin._id.toString());
  });
});