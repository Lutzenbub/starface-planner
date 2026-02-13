import cors from 'cors';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { ZodError } from 'zod';
import { modulesSchema } from './schema.js';
import { DEFAULT_DATA_FILE, readModules, writeModules } from './modulesStore.js';

const DEFAULT_PORT = Number(process.env.STARFACE_BACKEND_PORT || 55123);

const formatZodError = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

export const createApp = ({ dataFile = DEFAULT_DATA_FILE } = {}) => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'starface-planner-backend',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/modules', async (_req, res) => {
    try {
      const modules = await readModules(dataFile);
      res.json(modules);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(500).json({ error: 'Stored data is invalid', issues: formatZodError(error) });
        return;
      }

      console.error('GET /api/modules failed:', error);
      res.status(500).json({ error: 'Could not load modules' });
    }
  });

  app.post('/api/modules', async (req, res) => {
    const parseResult = modulesSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: formatZodError(parseResult.error),
      });
      return;
    }

    try {
      await writeModules(parseResult.data, dataFile);
      res.status(200).json({ ok: true, count: parseResult.data.length });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', issues: formatZodError(error) });
        return;
      }

      console.error('POST /api/modules failed:', error);
      res.status(500).json({ error: 'Could not save modules' });
    }
  });

  return app;
};

export const startServer = ({ port = DEFAULT_PORT, dataFile = DEFAULT_DATA_FILE } = {}) =>
  new Promise((resolve, reject) => {
    const app = createApp({ dataFile });
    const server = app.listen(port, () => {
      const address = server.address();
      const resolvedPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        app,
        server,
        port: resolvedPort,
        url: `http://127.0.0.1:${resolvedPort}`,
      });
    });
    server.on('error', reject);
  });

const runAsMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (runAsMain) {
  startServer()
    .then(({ url }) => {
      console.log(`Starface backend listening on ${url}`);
    })
    .catch((error) => {
      console.error('Failed to start backend server:', error);
      process.exit(1);
    });
}
