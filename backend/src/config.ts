import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseOrigins = (value: string | undefined): string[] => {
  if (!value || !value.trim()) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export interface AppConfig {
  port: number;
  logLevel: string;
  debug: boolean;
  debugDir: string;
  authDir: string;
  syncDataDir: string;
  csrfToken: string;
  allowedOrigins: string[];
  requestTimeoutMs: number;
  syncTimeoutMs: number;
  syncCooldownMs: number;
  loginTimeoutMs: number;
  navigationTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  playwrightHeadless: boolean;
}

export const resolveConfig = (): AppConfig => {
  const dataRoot = path.join(backendRoot, 'data');
  const runtimePort = process.env.STARFACE_BACKEND_PORT ?? process.env.PORT;
  return {
    port: parseNumber(runtimePort, 55123),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    debug: parseBoolean(process.env.DEBUG, false),
    debugDir: process.env.DEBUG_DIR ?? path.join(backendRoot, 'DEBUG'),
    authDir: process.env.STARFACE_AUTH_DIR ?? path.join(backendRoot, '.auth'),
    syncDataDir: process.env.STARFACE_SYNC_DATA_DIR ?? path.join(dataRoot, 'instances'),
    csrfToken: process.env.STARFACE_CSRF_TOKEN ?? crypto.randomBytes(32).toString('hex'),
    allowedOrigins: parseOrigins(process.env.STARFACE_ALLOWED_ORIGINS),
    requestTimeoutMs: parseNumber(process.env.STARFACE_REQUEST_TIMEOUT_MS, 45000),
    syncTimeoutMs: parseNumber(process.env.STARFACE_SYNC_TIMEOUT_MS, 120000),
    syncCooldownMs: parseNumber(process.env.STARFACE_SYNC_COOLDOWN_MS, 15000),
    loginTimeoutMs: parseNumber(process.env.STARFACE_LOGIN_TIMEOUT_MS, 30000),
    navigationTimeoutMs: parseNumber(process.env.STARFACE_NAV_TIMEOUT_MS, 30000),
    rateLimitWindowMs: parseNumber(process.env.STARFACE_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMaxRequests: parseNumber(process.env.STARFACE_RATE_LIMIT_MAX, 60),
    playwrightHeadless: parseBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
  };
};
