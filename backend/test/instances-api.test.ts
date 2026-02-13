import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MockStarfaceAutomation } from '../src/starface/automation.js';
import type { AppConfig } from '../src/config.js';

const createTestConfig = (baseDir: string): AppConfig => ({
  port: 0,
  logLevel: 'silent',
  debug: false,
  debugDir: path.join(baseDir, 'debug'),
  authDir: path.join(baseDir, '.auth'),
  syncDataDir: path.join(baseDir, 'sync-data'),
  csrfToken: 'test-csrf-token',
  allowedOrigins: ['http://localhost:3000'],
  requestTimeoutMs: 5000,
  syncTimeoutMs: 15000,
  syncCooldownMs: 0,
  loginTimeoutMs: 5000,
  navigationTimeoutMs: 5000,
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 100,
  playwrightHeadless: true,
});

describe('instances api', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starface-backend-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates instance, syncs modules and returns health data', async () => {
    const config = createTestConfig(tempDir);
    const automation = new MockStarfaceAutomation();
    const { app } = createApp({ config, automation });

    const csrfResponse = await request(app).get('/api/csrf');
    expect(csrfResponse.status).toBe(200);

    const csrfToken = csrfResponse.body.csrfToken;

    const createResponse = await request(app)
      .post('/api/instances')
      .set('x-csrf-token', csrfToken)
      .send({
        baseUrl: 'kundenanlage01',
        username: 'admin',
        password: 'secret',
        displayName: 'Kundenanlage',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.baseUrl).toBe('https://kundenanlage01.starface-cloud.com');

    const instanceId = createResponse.body.instanceId as string;

    const syncResponse = await request(app)
      .post(`/api/instances/${instanceId}/sync`)
      .set('x-csrf-token', csrfToken)
      .send({});

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.summary.instanceId).toBe(instanceId);
    expect(syncResponse.body.summary.modulesCount).toBeGreaterThan(0);

    const modulesResponse = await request(app).get(`/api/instances/${instanceId}/modules`);
    expect(modulesResponse.status).toBe(200);
    expect(modulesResponse.body.instanceId).toBe(instanceId);
    expect(Array.isArray(modulesResponse.body.modules)).toBe(true);

    const healthResponse = await request(app).get(`/api/instances/${instanceId}/health`);
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body.loginOk).toBe(true);
    expect(healthResponse.body.lastSuccessfulSyncAt).toBeTruthy();
  });

  it('rejects missing csrf token on mutating routes', async () => {
    const config = createTestConfig(tempDir);
    const { app } = createApp({ config, automation: new MockStarfaceAutomation() });

    const response = await request(app).post('/api/instances').send({
      baseUrl: 'tenant1',
      username: 'admin',
      password: 'secret',
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });
});
