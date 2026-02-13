import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/server.js';

const createTempDataFile = async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starface-backend-'));
  return {
    tempDir,
    dataFile: path.join(tempDir, 'modules.json'),
  };
};

const validModulesPayload = [
  {
    id: 'module-1',
    name: 'Sales',
    phoneNumber: '1234',
    active: true,
    order: 0,
    color: '#336699',
    rules: [
      {
        id: 'rule-1',
        weekdays: [1, 2, 3],
        intervals: [
          {
            id: 'interval-1',
            start: '09:00',
            end: '17:00',
          },
        ],
      },
    ],
    forwardingTarget: '',
  },
];

test('GET /api/modules returns empty array when file is missing', async (t) => {
  const { tempDir, dataFile } = await createTempDataFile();
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const app = createApp({ dataFile });
  const response = await request(app).get('/api/modules');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test('POST /api/modules stores valid modules and GET returns them', async (t) => {
  const { tempDir, dataFile } = await createTempDataFile();
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const app = createApp({ dataFile });
  const postResponse = await request(app).post('/api/modules').send(validModulesPayload);
  const getResponse = await request(app).get('/api/modules');

  assert.equal(postResponse.status, 200);
  assert.equal(postResponse.body.ok, true);
  assert.equal(postResponse.body.count, validModulesPayload.length);
  assert.deepEqual(getResponse.body, validModulesPayload);
});

test('POST /api/modules rejects invalid payload', async (t) => {
  const { tempDir, dataFile } = await createTempDataFile();
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const invalidPayload = [
    {
      id: 'bad-module',
      name: 'Broken',
      phoneNumber: '555',
      active: true,
      order: 0,
      color: '#111111',
      rules: [
        {
          id: 'rule-1',
          intervals: [
            {
              id: 'bad-interval',
              start: '17:00',
              end: '09:00',
            },
          ],
        },
      ],
    },
  ];

  const app = createApp({ dataFile });
  const response = await request(app).post('/api/modules').send(invalidPayload);

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Validation failed');
  assert.ok(Array.isArray(response.body.issues));
  assert.ok(response.body.issues.length > 0);
});
