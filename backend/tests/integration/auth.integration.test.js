// backend/tests/integration/auth.integration.test.js
'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345678901234567890';

const request = require('supertest');
let mongoose;
const os = require('os');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let buildApp;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
        binary: { version: '8.0.12' },
    });

    process.env.MONGO_URI = mongod.getUri('ethio_test_auth');

    // Reset modules BEFORE loading Mongoose or the app.
    jest.resetModules();

    // Ensure the test and app use the same Mongoose instance.
    mongoose = require('mongoose');

    await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
    });

    buildApp = require('../../src/app');
    app = buildApp();
}, 60000);

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
}, 60000);

afterEach(async () => {
    if (!mongoose.connection.db) return;

    const collections = await mongoose.connection.db.collections();

    for (const collection of collections) {
        await collection.deleteMany({});
    }
});

const VALID_BUYER = {
    fullName: 'Abebe Bikila',
    email: 'abebe@example.com',
    phone: '0911223344',
    password: 'StrongPass123',
    role: 'buyer',
};

describe('Auth — register/login/refresh/logout/me', () => {
    test('register creates a buyer and returns tokens', async () => {
        const res = await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user.email).toBe('abebe@example.com');
        expect(res.body.data.user.role).toBe('buyer');
        expect(res.body.data.user.passwordHash).toBeUndefined();
        expect(res.body.data.tokens.accessToken).toBeTruthy();
        expect(res.body.data.tokens.refreshToken).toBeTruthy();
    });

    test('register rejects duplicate email with 409 USER_EXISTS', async () => {
        await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const res = await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('USER_EXISTS');
    });

    test('register rejects weak password with 422 VALIDATION_ERROR', async () => {
        const res = await request(app).post('/api/v1/auth/register')
            .send({ ...VALID_BUYER, email: 'b@example.com', phone: '0911223355', password: 'short' });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
    });

    test('register forbids admin role', async () => {
        const res = await request(app).post('/api/v1/auth/register')
            .send({ ...VALID_BUYER, email: 'admin@example.com', phone: '0911223366', role: 'admin' });
        expect(res.status).toBe(422);
    });

    test('login with email succeeds', async () => {
        await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const res = await request(app).post('/api/v1/auth/login')
            .send({ identifier: 'abebe@example.com', password: 'StrongPass123' });
        expect(res.status).toBe(200);
        expect(res.body.data.tokens.accessToken).toBeTruthy();
    });

    test('login with phone succeeds', async () => {
        await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const res = await request(app).post('/api/v1/auth/login')
            .send({ identifier: '0911223344', password: 'StrongPass123' });
        expect(res.status).toBe(200);
    });

    test('login with wrong password returns generic 401', async () => {
        await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const res = await request(app).post('/api/v1/auth/login')
            .send({ identifier: 'abebe@example.com', password: 'WrongPass123' });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(res.body.error.message).not.toMatch(/user/i);
    });

    test('GET /me without token returns 401', async () => {
        const res = await request(app).get('/api/v1/auth/me');
        expect(res.status).toBe(401);
    });

    test('GET /me with token returns profile', async () => {
        const reg = await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const token = reg.body.data.tokens.accessToken;
        const res = await request(app).get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe('abebe@example.com');
    });

    test('refresh rotates tokens and old refresh is revoked', async () => {
        const reg = await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const oldRefresh = reg.body.data.tokens.refreshToken;

        const r1 = await request(app).post('/api/v1/auth/refresh')
            .send({ refreshToken: oldRefresh });
        expect(r1.status).toBe(200);
        const newRefresh = r1.body.data.tokens.refreshToken;
        expect(newRefresh).not.toBe(oldRefresh);

        // Reusing old refresh fails
        const r2 = await request(app).post('/api/v1/auth/refresh')
            .send({ refreshToken: oldRefresh });
        expect(r2.status).toBe(401);
    });

    test('logout revokes session; refresh fails afterwards', async () => {
        const reg = await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const { accessToken, refreshToken } = reg.body.data.tokens;

        const out = await request(app).post('/api/v1/auth/logout')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ refreshToken });
        expect(out.status).toBe(200);

        const r = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
        expect(r.status).toBe(401);
    });

    test('forgot-password returns devResetToken in dev/test only', async () => {
        await request(app).post('/api/v1/auth/register').send(VALID_BUYER);
        const res = await request(app).post('/api/v1/auth/forgot-password')
            .send({ email: 'abebe@example.com' });
        expect(res.status).toBe(200);
        expect(res.body.data.devResetToken).toBeTruthy();
    });

    test('reset-password with valid token changes password and revokes sessions', async () => {
        const reg = await request(app)
            .post('/api/v1/auth/register')
            .send(VALID_BUYER);

        const oldRefresh = reg.body.data.tokens.refreshToken;

        const fp = await request(app)
            .post('/api/v1/auth/forgot-password')
            .send({ email: 'abebe@example.com' });

            const resetToken = fp.body.data.devResetToken;


        const reset = await request(app).post('/api/v1/auth/reset-password')
            .send({ token: resetToken, password: 'NewStrongPass456' });
        expect(reset.status).toBe(200);

        // Old refresh no longer works
        const r = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: oldRefresh });
        expect(r.status).toBe(401);

        // Login with new password works
        const login = await request(app).post('/api/v1/auth/login')
            .send({ identifier: 'abebe@example.com', password: 'NewStrongPass456' });
        expect(login.status).toBe(200);
    });
});