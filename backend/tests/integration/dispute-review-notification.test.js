// backend/tests/integration/dispute-review-notification.test.js
'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-12345678901234567890';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-12345678901234567890';
process.env.MANUAL_PAY_ACCOUNT = '1000123456789';
process.env.MANUAL_PAY_RECIPIENT_NAME = 'Test Recipient';

const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongoose;

let mongod; let app;
let User; let Category; let ImporterProfile; let Order;
let CommissionRule; let PaymentRecord; let Dispute; let Review;
let Notification; let Shipment; let Conversation; let Message; let AuditLog;

beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
        binary: { version: '8.0.12' },
        replSet: { count: 1 },
    });

    process.env.MONGO_URI = mongod.getUri('ethio_test_1_7');

    // Load a fresh Mongoose instance after resetting modules.
    jest.resetModules();
    mongoose = require('mongoose');

    await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
    });

    console.log('Mongoose readyState:', mongoose.connection.readyState);
    console.log('Mongoose database:', mongoose.connection.name);

    app = require('../../src/app')();

    ({ User } = require('../../src/modules/users/user.model'));
    ({ Category } = require('../../src/modules/categories/category.model'));
    ({ ImporterProfile } = require('../../src/modules/importers/importerProfile.model'));
    ({ Order } = require('../../src/modules/orders/order.model'));
    ({ CommissionRule } = require('../../src/modules/commissions/commissionRule.model'));
    ({ PaymentRecord } = require('../../src/modules/payments/paymentRecord.model'));
    ({ Dispute } = require('../../src/modules/disputes/dispute.model'));
    ({ Review } = require('../../src/modules/reviews/review.model'));
    ({ Notification } = require('../../src/modules/notifications/notification.model'));
    ({ Shipment } = require('../../src/modules/shipments/shipment.model'));
    ({ Conversation } = require('../../src/modules/messaging/conversation.model'));
    ({ Message } = require('../../src/modules/messaging/message.model'));
    ({ AuditLog } = require('../../src/modules/admin/auditLog.model'));
}, 60000);
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
    const u = new User({ fullName: `U${seq}`, email: `u${seq}@t.local`, phone: `09${String(10000000 + seq).slice(-8)}`, role });
    await u.setPassword('StrongPass123');
    await u.save();
    return u;
}
async function loginAs(u) {
    const r = await request(app).post('/api/v1/auth/login').send({ identifier: u.email, password: 'StrongPass123' });
    return r.body.data.tokens.accessToken;
}
async function approvedImporter() {
    const u = await createUser('importer');
    await ImporterProfile.create({ user: u._id, businessName: `Co ${seq}`, verificationStatus: 'approved', verifiedAt: new Date() });
    return u;
}
async function seedRule() {
    seq += 1;
    return CommissionRule.create({
        name: 'T5', version: `t.v${seq}`, feeType: 'percentage', percentage: 5, payer: 'buyer',
        categoryIds: [], effectiveFrom: new Date('2020-01-01'), isActive: true,
    });
}
async function setupCompletedOrder() {
    await seedRule();
    const cat = await Category.create({ name: `Cat${seq}`, slug: `c-${seq}` });
    const buyer = await createUser('buyer');
    const imp = await approvedImporter();
    const admin = await createUser('admin');
    const bTok = await loginAs(buyer);
    const iTok = await loginAs(imp);
    const aTok = await loginAs(admin);

    const req = await request(app).post('/api/v1/requests').set('Authorization', `Bearer ${bTok}`).send({
        title: 'Test Product Request',
description: 'A new test product with warranty included',
        category: cat._id.toString(), quantity: 1, deliveryCity: 'Addis Ababa',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });

    if (req.status !== 201) {
    throw new Error(
        `Failed to create product request: ${req.status} ${JSON.stringify(req.body)}`
    );
}

const publishResponse = await request(app)
    .post(`/api/v1/requests/me/${req.body.data._id}/publish`)
    .set('Authorization', `Bearer ${bTok}`);

if (publishResponse.status !== 200) {
    throw new Error(
        `Failed to publish product request: ${publishResponse.status} ${JSON.stringify(publishResponse.body)}`
    );
}

const quoteResponse = await request(app)
    .post(`/api/v1/quotations/requests/${req.body.data._id}/quotes`)
    .set('Authorization', `Bearer ${iTok}`)
    .send({
        totalPriceETB: 100,
        productCondition: 'new',
        estimatedDeliveryDays: 7,
        quotationValidUntil: new Date(Date.now() + 3600000).toISOString(),
    });

if (quoteResponse.status !== 201) {
    throw new Error(
        `Failed to create quotation: ${quoteResponse.status} ${JSON.stringify(quoteResponse.body)}`
    );
}

const q = quoteResponse;

const ord = await request(app)
    .post(`/api/v1/quotations/${q.body.data._id}/accept`)
    .set('Authorization', `Bearer ${bTok}`);

if (ord.status !== 201) {
    throw new Error(
        `Failed to accept quotation: ${ord.status} ${JSON.stringify(ord.body)}`
    );
}

    return { buyer, imp, admin, bTok, iTok, aTok, orderId: ord.body.data._id };
}

async function progressToCompleted(aTok, iTok, bTok, orderId) {
    await request(app).post(`/api/v1/admin/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${aTok}`)
        .send({ to: 'payment_condition_satisfied' });

    const steps = ['importer_start_processing', 'importer_mark_shipped', 'importer_mark_in_transit', 'importer_mark_ready', 'importer_mark_delivered'];
    for (const action of steps) {
        // eslint-disable-next-line no-await-in-loop
        await request(app).post(`/api/v1/orders/${orderId}/transition`)
            .set('Authorization', `Bearer ${iTok}`).send({ action });
    }
    await request(app).post(`/api/v1/orders/${orderId}/transition`)
        .set('Authorization', `Bearer ${bTok}`).send({ action: 'buyer_confirm_receipt' });
}

// ---------- Tests ----------

describe('Notifications tied to real persisted events (prompt §13.13)', () => {
    test('quotation submission notifies the buyer with event link to quotation', async () => {
        await seedRule();

        const cat = await Category.create({
            name: `C${seq}`,
            slug: `c-${seq}`,
        });

        const buyer = await createUser('buyer');
        const imp = await approvedImporter();

        const bTok = await loginAs(buyer);
        const iTok = await loginAs(imp);

        // 1. Create a product request
        const req = await request(app)
            .post('/api/v1/requests')
            .set('Authorization', `Bearer ${bTok}`)
            .send({
                title: 'Test Product Request',
                description: 'A new test product with warranty included',
                category: cat._id.toString(),
                quantity: 1,
                deliveryCity: 'Addis Ababa',
                expiresAt: new Date(
                    Date.now() + 30 * 24 * 3600 * 1000
                ).toISOString(),
            });

        expect(req.status).toBe(201);
        expect(req.body.data._id).toBeTruthy();

        const requestId = req.body.data._id;

        // 2. Publish the product request
        const publishResponse = await request(app)
            .post(`/api/v1/requests/me/${requestId}/publish`)
            .set('Authorization', `Bearer ${bTok}`);

        expect([200, 204]).toContain(publishResponse.status);

        // 3. Submit a quotation
        const quoteResponse = await request(app)
            .post(`/api/v1/quotations/requests/${requestId}/quotes`)
            .set('Authorization', `Bearer ${iTok}`)
            .send({
                totalPriceETB: 100,
                productCondition: 'new',
                estimatedDeliveryDays: 7,
                quotationValidUntil: new Date(
                    Date.now() + 3600000
                ).toISOString(),
            });

        console.log('QUOTATION STATUS:', quoteResponse.status);
        console.log(
            'QUOTATION BODY:',
            JSON.stringify(quoteResponse.body, null, 2)
        );

        expect(quoteResponse.status).toBe(201);

        // 4. Verify the quotation was persisted
        const { Quotation } = require(
            '../../src/modules/quotations/quotation.model'
        );

        const quotationId = quoteResponse.body.data._id;
        expect(quotationId).toBeTruthy();

        const savedQuotation = await Quotation.findById(quotationId);
        expect(savedQuotation).toBeTruthy();

        // 5. Verify the notification was persisted for the buyer
        const n = await Notification.findOne({
            recipient: buyer._id,
            type: 'quotation_submitted',
        });

        console.log(
            'QUOTATION NOTIFICATION:',
            JSON.stringify(n, null, 2)
        );

        expect(n).toBeTruthy();
        expect(n.event.type).toBe('Quotation');
        expect(n.event.targetId.toString()).toBe(
            quotationId.toString()
        );

        // 6. Verify the notification links to a real quotation
        const linkedQuotation = await Quotation.findById(
            n.event.targetId
        );

        expect(linkedQuotation).toBeTruthy();
        expect(linkedQuotation._id.toString()).toBe(
            quotationId.toString()
        );
    });
});

describe('Shipments', () => {
    test('importer can post event; buyer can read it', async () => {
        const { bTok, iTok, orderId } = await setupCompletedOrder();
        const add = await request(app).post(`/api/v1/shipments/orders/${orderId}/events`)
            .set('Authorization', `Bearer ${iTok}`)
            .send({ stage: 'picked_up', description: 'Left Shenzhen warehouse', occurredAt: new Date().toISOString() });
        expect(add.status).toBe(201);
        expect(add.body.data.events.length).toBe(1);

        const get = await request(app).get(`/api/v1/shipments/orders/${orderId}`)
            .set('Authorization', `Bearer ${bTok}`);
        expect(get.status).toBe(200);
        expect(get.body.data.events[0].stage).toBe('picked_up');
    });

    test('buyer cannot post shipment event', async () => {
        const { bTok, orderId } = await setupCompletedOrder();
        const res = await request(app).post(`/api/v1/shipments/orders/${orderId}/events`)
            .set('Authorization', `Bearer ${bTok}`)
            .send({ stage: 'picked_up', occurredAt: new Date().toISOString() });
        expect(res.status).toBe(403);
    });
});

describe('Messaging', () => {
    test('conversation is created and messages flow buyer↔importer', async () => {
        const { bTok, iTok, orderId } = await setupCompletedOrder();
        // Send message as buyer (creates conversation via admin path — trigger via reply)
        // Instead, we use admin path to bootstrap conversation, then message via public API.
        // Cleaner: use messaging.service directly via a raw API call.
        // Bootstrapping conversation: send a message via admin for the order creates the convo.
        const admin = await createUser('admin');
        const aTok = await loginAs(admin);
        await request(app).get(`/api/v1/admin/orders/${orderId}/messages`).set('Authorization', `Bearer ${aTok}`);
        const convo = await Conversation.findOne({ order: orderId });
        expect(convo).toBeTruthy();

        await request(app).post(`/api/v1/messages/${convo._id}/messages`)
            .set('Authorization', `Bearer ${bTok}`)
            .send({ body: 'Hello importer, when will it ship?' });
        await request(app).post(`/api/v1/messages/${convo._id}/messages`)
            .set('Authorization', `Bearer ${iTok}`)
            .send({ body: 'Shipping Monday.' });

        const list = await request(app).get(`/api/v1/messages/${convo._id}/messages`)
            .set('Authorization', `Bearer ${bTok}`);
        expect(list.body.data.length).toBe(2);
    });

    test('unrelated user cannot read conversation', async () => {
        const { orderId } = await setupCompletedOrder();
        const admin = await createUser('admin');
        const aTok = await loginAs(admin);
        await request(app).get(`/api/v1/admin/orders/${orderId}/messages`).set('Authorization', `Bearer ${aTok}`);
        const convo = await Conversation.findOne({ order: orderId });

        const stranger = await createUser('buyer');
        const sTok = await loginAs(stranger);
        const res = await request(app).get(`/api/v1/messages/${convo._id}/messages`)
            .set('Authorization', `Bearer ${sTok}`);
        expect(res.status).toBe(403);
    });
});

describe('Disputes block completion (prompt §13.12)', () => {
    test('buyer opens dispute → order becomes disputed; completion blocked', async () => {
        const { bTok, iTok, orderId } = await setupCompletedOrder();
        // Move to in_transit so DISPUTED is legal
        const admin = await createUser('admin');
        const aTok = await loginAs(admin);
        await request(app).post(`/api/v1/admin/orders/${orderId}/transition`)
            .set('Authorization', `Bearer ${aTok}`).send({ to: 'payment_condition_satisfied' });
        for (const action of ['importer_start_processing', 'importer_mark_shipped', 'importer_mark_in_transit']) {
            // eslint-disable-next-line no-await-in-loop
            await request(app).post(`/api/v1/orders/${orderId}/transition`)
                .set('Authorization', `Bearer ${iTok}`).send({ action });
        }

        const d = await request(app).post(`/api/v1/disputes/orders/${orderId}`)
            .set('Authorization', `Bearer ${bTok}`)
            .send({ reason: 'excessive_delay', description: 'Well past agreed delivery window' });
        expect(d.status).toBe(201);

        const order = await Order.findById(orderId);
        expect(order.status).toBe('disputed');

        // Attempt importer transition to delivered — must fail
        const blocked = await request(app).post(`/api/v1/orders/${orderId}/transition`)
            .set('Authorization', `Bearer ${iTok}`)
            .send({ action: 'importer_mark_delivered' });
        expect([403, 409]).toContain(blocked.status);
    });

    test('admin resolves in buyer favor → refund_pending and notification', async () => {
        const { bTok, iTok, aTok, orderId } = await setupCompletedOrder();
        await request(app).post(`/api/v1/admin/orders/${orderId}/transition`)
            .set('Authorization', `Bearer ${aTok}`).send({ to: 'payment_condition_satisfied' });
        for (const action of ['importer_start_processing', 'importer_mark_shipped', 'importer_mark_in_transit']) {
            // eslint-disable-next-line no-await-in-loop
            await request(app).post(`/api/v1/orders/${orderId}/transition`)
                .set('Authorization', `Bearer ${iTok}`).send({ action });
        }
        const d = await request(app).post(`/api/v1/disputes/orders/${orderId}`)
            .set('Authorization', `Bearer ${bTok}`)
            .send({ reason: 'excessive_delay', description: 'One month late' });

        const res = await request(app).post(`/api/v1/admin/disputes/${d.body.data._id}/resolve`)
            .set('Authorization', `Bearer ${aTok}`)
            .send({ outcome: 'resolved_buyer_favor', notes: 'Full refund', refundPromisedETB: 100000 });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('resolved_buyer_favor');

        const order = await Order.findById(orderId);
        expect(['refund_pending', 'disputed']).toContain(order.status);

        // Notification was persisted for buyer
        const n = await Notification.findOne({ recipient: order.buyer, type: 'dispute_resolved' });
        expect(n).toBeTruthy();
        // Audit log entry
        const audit = await AuditLog.findOne({ action: 'dispute.resolve' });
        expect(audit).toBeTruthy();
        expect(audit.targetId.toString()).toBe(d.body.data._id);
    });
});

describe('Reviews', () => {
    test('buyer reviews completed order; importer aggregate updated', async () => {
        const { bTok, iTok, aTok, orderId, imp } = await setupCompletedOrder();
        await progressToCompleted(aTok, iTok, bTok, orderId);

        const res = await request(app).post(`/api/v1/reviews/orders/${orderId}`)
            .set('Authorization', `Bearer ${bTok}`)
            .send({ rating: 5, comment: 'Excellent!' });
        expect(res.status).toBe(201);

        const profile = await ImporterProfile.findOne({ user: imp._id });
        expect(profile.ratingAverage).toBe(5);
        expect(profile.ratingCount).toBe(1);
    });

    test('cannot review twice on same order', async () => {
        const { bTok, iTok, aTok, orderId } = await setupCompletedOrder();
        await progressToCompleted(aTok, iTok, bTok, orderId);
        await request(app).post(`/api/v1/reviews/orders/${orderId}`)
            .set('Authorization', `Bearer ${bTok}`).send({ rating: 5 });
        const res = await request(app).post(`/api/v1/reviews/orders/${orderId}`)
            .set('Authorization', `Bearer ${bTok}`).send({ rating: 4 });
        expect(res.status).toBe(409);
    });

    test('cannot review incomplete order', async () => {
        const { bTok, orderId } = await setupCompletedOrder();
        const res = await request(app).post(`/api/v1/reviews/orders/${orderId}`)
            .set('Authorization', `Bearer ${bTok}`).send({ rating: 5 });
        expect(res.status).toBe(409);
    });
});

describe('Admin audit log (prompt §13.16)', () => {
    test('importer approval recorded in audit log', async () => {
        const imp = await createUser('importer');
        await ImporterProfile.create({ user: imp._id, businessName: 'Aud Co', verificationStatus: 'pending' });
        const admin = await createUser('admin');
        const aTok = await loginAs(admin);
        const profile = await ImporterProfile.findOne({ user: imp._id });

        await request(app).patch(`/api/v1/admin/importers/${profile._id}/review`)
            .set('Authorization', `Bearer ${aTok}`).send({ action: 'approve' });

        const audit = await AuditLog.findOne({ action: 'importer.approve', targetId: profile._id });
        expect(audit).toBeTruthy();
        expect(audit.actor.toString()).toBe(admin._id.toString());
    });
});