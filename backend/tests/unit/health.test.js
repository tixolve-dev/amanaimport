'use strict';

const request = require('supertest');
const buildApp = require('../../src/app');

describe('Health endpoints', () => {
  const app = buildApp();

  test('GET /health returns 200 and ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('GET /api/v1/health returns 200 with scope v1', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('v1');
  });

  test('GET unknown route returns 404 with ROUTE_NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  test('echoes custom request id header', async () => {
    const res = await request(app)
      .get('/health')
      .set('x-request-id', 'test-id-42');
    expect(res.headers['x-request-id']).toBe('test-id-42');
  });

  test('malformed JSON → 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{ bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});