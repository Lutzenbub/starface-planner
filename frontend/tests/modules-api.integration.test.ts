import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../backend/src/server.ts';
import { MockStarfaceAutomation } from '../../backend/src/starface/automation.ts';
import type { AppConfig } from '../../backend/src/config.ts';
import { createInstance, loadInstanceModules, syncInstance } from '../src/api/modulesApi';

describe('instances API integration', () => {
  let tempDir = '';
  let server: Server;
  let apiBaseUrl = '';

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starface-fullstack-'));

    const config: AppConfig = {
      port: 0,
      logLevel: 'silent',
      debug: false,
      debugDir: path.join(tempDir, 'debug'),
      authDir: path.join(tempDir, '.auth'),
      syncDataDir: path.join(tempDir, 'sync-data'),
      csrfToken: 'frontend-integration-csrf',
      allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      requestTimeoutMs: 5000,
      syncTimeoutMs: 15000,
      syncCooldownMs: 0,
      loginTimeoutMs: 5000,
      navigationTimeoutMs: 5000,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 200,
      playwrightHeadless: true,
    };

    const started = await startServer({
      port: 0,
      config,
      automation: new MockStarfaceAutomation(),
    });

    server = started.server;
    apiBaseUrl = started.url;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates an instance, syncs and loads normalized modules', async () => {
    const created = await createInstance(
      {
        baseUrl: 'integration-fixture',
        username: 'admin',
        password: 'secret',
      },
      apiBaseUrl,
    );

    expect(created.instanceId).toBeTruthy();

    const summary = await syncInstance(created.instanceId, apiBaseUrl);
    expect(summary.modulesCount).toBeGreaterThan(0);

    const payload = await loadInstanceModules(created.instanceId, apiBaseUrl);
    expect(payload.instanceId).toBe(created.instanceId);
    expect(payload.modules.length).toBeGreaterThan(0);
  });
});
