import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../backend/src/server.js';
import { loadModulesFromApi, saveModulesToApi } from '../src/api/modulesApi';
import type { Module } from '../src/types';

describe('modulesApi integration', () => {
  let tempDir = '';
  let server: Server;
  let apiBaseUrl = '';

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starface-fullstack-'));
    const dataFile = path.join(tempDir, 'modules.json');
    const started = await startServer({ port: 0, dataFile });
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

  it('saves and loads modules against the live backend', async () => {
    const modules: Module[] = [
      {
        id: 'frontend-int-1',
        name: 'Frontend Integration',
        phoneNumber: '4242',
        active: true,
        order: 0,
        color: '#225577',
        rules: [],
        forwardingTarget: '',
      },
    ];

    await saveModulesToApi(modules, apiBaseUrl);
    const loadedModules = await loadModulesFromApi(apiBaseUrl);

    expect(loadedModules).toEqual(modules);
  });
});
