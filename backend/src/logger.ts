import pino from 'pino';
import type { RequestHandler } from 'express';
import type { AppConfig } from './config.js';

export const createLogger = (config: AppConfig) =>
  pino({
    level: config.logLevel,
    redact: {
      paths: [
        '*.password',
        'password',
        'username',
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    base: undefined,
  });

export const createHttpLogger = (logger: pino.Logger): RequestHandler => (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const payload = {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500) {
      logger.error(payload, 'request failed');
      return;
    }

    if (res.statusCode >= 400) {
      logger.warn(payload, 'request completed with client error');
      return;
    }

    logger.info(payload, 'request completed');
  });

  next();
};
