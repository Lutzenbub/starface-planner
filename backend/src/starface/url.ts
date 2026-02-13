import { AppError } from '../errors.js';

const cloudHostRegex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i;

const ensureHttps = (rawValue: string): URL => {
  const value = rawValue.trim();
  if (!value) {
    throw new AppError('VALIDATION_ERROR', 'baseUrl darf nicht leer sein', 400);
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'baseUrl ist kein gueltiger URL Wert', 400);
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '';
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new AppError('VALIDATION_ERROR', 'Nur http/https sind erlaubt', 400);
  }

  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
  }

  return parsed;
};

export const normalizeStarfaceBaseUrl = (input: string): string => {
  const value = input.trim();

  if (cloudHostRegex.test(value)) {
    return `https://${value.toLowerCase()}.starface-cloud.com`;
  }

  const normalized = ensureHttps(value);

  if (normalized.hostname.endsWith('.starface-cloud.com')) {
    normalized.hostname = normalized.hostname.toLowerCase();
  }

  return normalized.toString().replace(/\/$/, '');
};
