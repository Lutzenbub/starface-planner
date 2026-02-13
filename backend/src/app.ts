import fs from 'node:fs/promises';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type pino from 'pino';
import { resolveConfig, type AppConfig } from './config.js';
import { AppError } from './errors.js';
import { createHttpLogger, createLogger } from './logger.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestTimeout } from './middleware/requestTimeout.js';
import { createInstanceInputSchema, instanceIdParamSchema } from './schema.js';
import { SyncService } from './services/syncService.js';
import { PlaywrightStarfaceAutomation } from './starface/automation.js';
import { normalizeStarfaceBaseUrl } from './starface/url.js';
import { selectorVersion } from './starface/selectors.js';
import { InstanceStore } from './stores/instanceStore.js';
import { SyncResultStore } from './stores/syncResultStore.js';
import type { StarfaceAutomation } from './types.js';

const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

const ensureRuntimeDirectories = async (config: AppConfig): Promise<void> => {
  await fs.mkdir(config.authDir, { recursive: true });
  await fs.mkdir(config.syncDataDir, { recursive: true });
  if (config.debug) {
    await fs.mkdir(config.debugDir, { recursive: true });
  }
};

export interface CreateAppOptions {
  config?: AppConfig;
  logger?: pino.Logger;
  automation?: StarfaceAutomation;
  instanceStore?: InstanceStore;
  syncResultStore?: SyncResultStore;
  syncService?: SyncService;
}

export const createApp = (options: CreateAppOptions = {}) => {
  const config = options.config ?? resolveConfig();
  const logger = options.logger ?? createLogger(config);
  const automation = options.automation ?? new PlaywrightStarfaceAutomation(config, logger);
  const instanceStore = options.instanceStore ?? new InstanceStore(config.authDir, selectorVersion);
  const syncResultStore = options.syncResultStore ?? new SyncResultStore(config.syncDataDir);
  const syncService =
    options.syncService ??
    new SyncService({
      automation,
      instanceStore,
      syncResultStore,
      syncCooldownMs: config.syncCooldownMs,
      syncTimeoutMs: config.syncTimeoutMs,
    });

  ensureRuntimeDirectories(config).catch((error) => {
    logger.error({ error }, 'Runtime-Verzeichnisse konnten nicht vorbereitet werden');
  });

  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  app.use(createHttpLogger(logger));
  app.use(requestTimeout(config.requestTimeoutMs));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (config.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin nicht erlaubt: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMaxRequests,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'starface-planner-backend',
      timestamp: new Date().toISOString(),
      selectorVersion,
      debug: config.debug,
    });
  });

  app.get('/api/csrf', (_req, res) => {
    res.json({
      csrfToken: config.csrfToken,
    });
  });

  app.use('/api', csrfProtection(config.csrfToken));

  app.get('/api/instances', (_req, res) => {
    res.json({
      instances: instanceStore.listSummaries(),
    });
  });

  app.post(
    '/api/instances',
    asyncHandler(async (req, res) => {
      const parsed = createInstanceInputSchema.parse(req.body);
      const baseUrl = normalizeStarfaceBaseUrl(parsed.baseUrl);

      const instance = instanceStore.upsert({
        baseUrl,
        username: parsed.username,
        password: parsed.password,
        displayName: parsed.displayName,
      });

      await syncService.verifyInstanceLogin(instance);

      res.status(201).json({
        instanceId: instance.instanceId,
        baseUrl: instance.baseUrl,
        displayName: instance.displayName,
        status: 'ready',
      });
    }),
  );

  app.post(
    '/api/instances/:instanceId/sync',
    asyncHandler(async (req, res) => {
      const { instanceId } = instanceIdParamSchema.parse(req.params);
      const instance = instanceStore.getById(instanceId);
      if (!instance) {
        throw new AppError('INSTANCE_NOT_FOUND', 'Instanz nicht gefunden', 404, { instanceId });
      }

      const summary = await syncService.syncInstance(instance);
      res.status(200).json({ summary });
    }),
  );

  app.get(
    '/api/instances/:instanceId/modules',
    asyncHandler(async (req, res) => {
      const { instanceId } = instanceIdParamSchema.parse(req.params);
      const instance = instanceStore.getById(instanceId);
      if (!instance) {
        throw new AppError('INSTANCE_NOT_FOUND', 'Instanz nicht gefunden', 404, { instanceId });
      }

      const payload = await syncResultStore.load(instanceId);
      if (!payload) {
        throw new AppError('INSTANCE_NOT_FOUND', 'Noch kein Sync-Ergebnis vorhanden', 404, { instanceId });
      }

      res.json(payload);
    }),
  );

  app.get(
    '/api/instances/:instanceId/health',
    asyncHandler(async (req, res) => {
      const { instanceId } = instanceIdParamSchema.parse(req.params);
      const instance = instanceStore.getById(instanceId);
      if (!instance) {
        throw new AppError('INSTANCE_NOT_FOUND', 'Instanz nicht gefunden', 404, { instanceId });
      }

      const health = instanceStore.getHealth(instanceId);
      if (!health) {
        throw new AppError('INSTANCE_NOT_FOUND', 'Health-Daten nicht verfuegbar', 404, { instanceId });
      }

      res.json(health);
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return {
    app,
    config,
    logger,
    instanceStore,
    syncResultStore,
    syncService,
  };
};
