import crypto from 'node:crypto';

export const createInstanceId = (baseUrl: string): string => {
  const digest = crypto.createHash('sha256').update(baseUrl).digest('hex').slice(0, 16);
  return `inst-${digest}`;
};
