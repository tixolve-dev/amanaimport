// backend/tests/integration/importer.integration.test.js
'use strict';

jest.setTimeout(30000);
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345678901234567890';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongod; let app;
let User; let Category; let ImporterProfile;

beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
        binary: { version: '7.0.14' },
        replSet: {
            count: 1,
            storageEngine: 'wiredTiger',
        },
    });

    process.env.MONGO_URI = mongod.getUri('ethio_test_importer');

    await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
    });

    // eslint-disable-next-line global-require
    app = require('../../src/app')();

    // eslint-disable-next-line global-require
    ({ User } = require('../../src/modules/users/user.model'));

    // eslint-disable-next-line global-require
    ({ Category } = require('../../src/modules/categories/category.model'));

    // eslint-disable-next-line global-require
    ({ ImporterProfile } = require('../../src/modules/importers/importerProfile.model'));
}, 30000);

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (mongod) {
        await mongod.stop();
    }
}, 30000);

afterEach(async () => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        return;
    }

    const collections = await mongoose.connection.db.collections();

    for (const collection of collections) {
        await collection.deleteMany({});
    }
});

// ---- Helpers --------------------------------------------------------------

let seq = 0;
async function createUser(role, overrides = {}) {
    seq += 1;
    const user = new User({
        fullName: `Test ${role} ${seq}`,
        email: `${role}${seq}@test.local`,
        phone: `09${String(10000000 + seq).slice(-8)}`,
        role,
        ...overrides,
    });
    await user.setPassword('StrongPass123');
    await user.save();
    return user;
}

async function createAdmin() {
    return createUser('admin');
}

async function loginAs(user) {
    const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: user.email, password: 'StrongPass123' });
    return res.body.data.tokens.accessToken;
}

async function createCategory(name) {
    return Category.create({
        name, slug: name.toLowerCase().replace(/\s+/g, '-'), isActive: true,
    });
}

// ---- Tests ---------------------------------------------------------------

describe('Categories', () => {
    test('public can list active categories; inactive hidden', async () => {
        await Category.create({ name: 'Active Cat', slug: 'active-cat' });
        await Category.create({ name: 'Hidden Cat', slug: 'hidden-cat', isActive: false });
        const res = await request(app).get('/api/v1/categories');
        expect(res.status).toBe(200);
        const slugs = res.body.data.map((c) => c.slug);
        expect(slugs).toContain('active-cat');
        expect(slugs).not.toContain('hidden-cat');
    });

    test('non-admin cannot create a category', async () => {
        const buyer = await createUser('buyer');
        const token = await loginAs(buyer);
        const res = await request(app).post('/api/v1/categories')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'New Cat' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('ROLE_NOT_ALLOWED');
    });

    test('admin can create a category', async () => {
        const admin = await createAdmin();
        const token = await loginAs(admin);
        const res = await request(app).post('/api/v1/categories')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'New Cat', description: 'x' });
        expect(res.status).toBe(201);
        expect(res.body.data.slug).toBe('new-cat');
    });

    test('duplicate slug rejected with 409', async () => {
        const admin = await createAdmin();
        const token = await loginAs(admin);
        await request(app).post('/api/v1/categories')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Dup Cat' });
        const res = await request(app).post('/api/v1/categories')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Dup Cat' });
        expect(res.status).toBe(409);
    });
});

describe('Importer verification lifecycle', () => {
    test('importer submits verification → status pending', async () => {
        const importer = await createUser('importer');
        const token = await loginAs(importer);
        const res = await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${token}`)
            .send({
                businessName: 'Yod Abyssinia Trading',
                businessType: 'company',
                serviceAreas: ['Addis Ababa', 'Adama'],
                description: 'We import electronics.',
            });
        expect(res.status).toBe(200);
        expect(res.body.data.verificationStatus).toBe('pending');
    });

    test('buyer cannot submit importer verification', async () => {
        const buyer = await createUser('buyer');
        const token = await loginAs(buyer);
        const res = await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${token}`)
            .send({ businessName: 'Not An Importer' });
        expect(res.status).toBe(403);
    });

    test('admin approves → status approved and verifiedAt set', async () => {
        const importer = await createUser('importer');
        const impToken = await loginAs(importer);
        const admin = await createAdmin();
        const adminToken = await loginAs(admin);

        await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Test Importer Co' });

        const profile = await ImporterProfile.findOne({ user: importer._id });

        const res = await request(app)
            .patch(`/api/v1/admin/importers/${profile._id}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ action: 'approve', notes: 'Documents verified' });
        console.log('APPROVAL RESPONSE:', JSON.stringify(res.body, null, 2));
        expect(res.status).toBe(200);
        expect(res.body.data.verificationStatus).toBe('approved');
        expect(res.body.data.verifiedAt).toBeTruthy();
        expect(res.body.data.verifiedBy.toString()).toBe(admin._id.toString());
    });

    test('admin rejects pending → status rejected', async () => {
        const importer = await createUser('importer');
        const impToken = await loginAs(importer);
        const admin = await createAdmin();
        const adminToken = await loginAs(admin);

        await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Reject Me Ltd' });

        const profile = await ImporterProfile.findOne({ user: importer._id });
        const res = await request(app)
            .patch(`/api/v1/admin/importers/${profile._id}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ action: 'reject', notes: 'Missing license' });

        console.log('REJECTION RESPONSE:', JSON.stringify(res.body, null, 2));
        expect(res.status).toBe(200);
        expect(res.body.data.verificationStatus).toBe('rejected');
        expect(res.body.data.verificationNotes).toBe('Missing license');
    });

    test('rejected importer can resubmit → back to pending', async () => {
        const importer = await createUser('importer');
        const impToken = await loginAs(importer);
        const admin = await createAdmin();
        const adminToken = await loginAs(admin);

        await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Resubmit Ltd' });
        const profile = await ImporterProfile.findOne({ user: importer._id });

        await request(app).patch(`/api/v1/admin/importers/${profile._id}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ action: 'reject', notes: 'x' });

        const res = await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Resubmit Ltd', description: 'updated' });
        expect(res.status).toBe(200);
        expect(res.body.data.verificationStatus).toBe('pending');
    });

    test('approved importer cannot resubmit', async () => {
        const importer = await createUser('importer');
        const impToken = await loginAs(importer);
        const admin = await createAdmin();
        const adminToken = await loginAs(admin);

        await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Stable Co' });
        const profile = await ImporterProfile.findOne({ user: importer._id });
        await request(app).patch(`/api/v1/admin/importers/${profile._id}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ action: 'approve' });

        const res = await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Stable Co' });
        expect(res.status).toBe(409);
    });

    test('non-admin cannot review importers', async () => {
        const importer = await createUser('importer');
        const impToken = await loginAs(importer);

        await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Test Co' });
        const profile = await ImporterProfile.findOne({ user: importer._id });

        const res = await request(app).patch(`/api/v1/admin/importers/${profile._id}/review`)
            .set('Authorization', `Bearer ${impToken}`)
            .send({ action: 'approve' });
        expect(res.status).toBe(403);
    });

    test('public summary rejects non-approved importers', async () => {
        const importer = await createUser('importer');
        const impToken = await loginAs(importer);
        await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({ businessName: 'Pending Co' });
        const profile = await ImporterProfile.findOne({ user: importer._id });

        const res = await request(app).get(`/api/v1/importers/${profile._id}/public`);
        expect(res.status).toBe(403);
    });

    test('public summary for approved importer hides contact details', async () => {
        const importer = await createUser('importer');
        const impToken = await loginAs(importer);
        const admin = await createAdmin();
        const adminToken = await loginAs(admin);

        await request(app).post('/api/v1/importers/me/verification')
            .set('Authorization', `Bearer ${impToken}`)
            .send({
                businessName: 'Public Co',
                contactPhone: '0911999999',
                contactEmail: 'public@test.local',
            });
        const profile = await ImporterProfile.findOne({ user: importer._id });
        await request(app).patch(`/api/v1/admin/importers/${profile._id}/review`)
            .set('Authorization', `Bearer ${adminToken}`).send({ action: 'approve' });

        const res = await request(app).get(`/api/v1/importers/${profile._id}/public`);
        expect(res.status).toBe(200);
        expect(res.body.data.businessName).toBe('Public Co');
        expect(res.body.data.contactPhone).toBeUndefined();
        expect(res.body.data.contactEmail).toBeUndefined();
        expect(res.body.data.documents).toBeUndefined();
    });
});