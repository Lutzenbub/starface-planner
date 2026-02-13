const removeTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const resolveApiBaseUrl = (apiBaseUrl?: string): string => {
  const raw = apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '';
  return removeTrailingSlash(raw);
};

const apiPath = (path: string, apiBaseUrl?: string): string => `${resolveApiBaseUrl(apiBaseUrl)}${path}`;

const csrfTokenCache = new Map<string, string>();

const getCsrfToken = async (apiBaseUrl?: string): Promise<string> => {
  const base = resolveApiBaseUrl(apiBaseUrl);
  if (csrfTokenCache.has(base)) {
    return csrfTokenCache.get(base) as string;
  }

  const response = await fetch(apiPath('/api/csrf', apiBaseUrl));
  if (!response.ok) {
    throw new Error(`CSRF token request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { csrfToken?: string };
  if (!payload.csrfToken) {
    throw new Error('CSRF token missing in response');
  }

  csrfTokenCache.set(base, payload.csrfToken);
  return payload.csrfToken;
};

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    if (payload.error?.code || payload.error?.message) {
      return `${payload.error.code ?? 'API_ERROR'}: ${payload.error.message ?? 'Request failed'}`;
    }
  } catch {
    // Keep fallback.
  }

  return `Request failed with status ${response.status}`;
};

const jsonRequest = async <T>(
  path: string,
  options: RequestInit = {},
  requiresCsrf = false,
  apiBaseUrl?: string,
): Promise<T> => {
  const headers = new Headers(options.headers ?? {});
  headers.set('Accept', 'application/json');

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (requiresCsrf) {
    headers.set('x-csrf-token', await getCsrfToken(apiBaseUrl));
  }

  const response = await fetch(apiPath(path, apiBaseUrl), {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as T;
};

export interface InstanceSummary {
  instanceId: string;
  baseUrl: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstanceInput {
  baseUrl: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface CreateInstanceResponse {
  instanceId: string;
  baseUrl: string;
  displayName?: string;
  status: 'ready';
}

export interface SyncSummary {
  instanceId: string;
  fetchedAt: string;
  modulesCount: number;
  rulesCount: number;
  warnings: string[];
}

export interface RuleTimeWindow {
  start: string;
  end: string;
}

export interface RuleDateRange {
  start: string;
  end: string;
}

export interface RuleTarget {
  type: 'number' | 'user' | 'announcement' | 'mailbox' | 'unknown';
  value: string;
}

export interface NormalizedRule {
  ruleId: string;
  label: string;
  daysOfWeek: number[];
  timeWindows: RuleTimeWindow[];
  dateRange?: RuleDateRange;
  target?: RuleTarget;
  order: number;
  rawText: string;
  active?: boolean;
}

export interface NormalizedModule {
  moduleId: string;
  moduleName: string;
  modulePhoneNumber?: string;
  active?: boolean;
  rules: NormalizedRule[];
}

export interface NormalizedModulesPayload {
  instanceId: string;
  fetchedAt: string;
  selectorVersion: string;
  warnings: string[];
  modules: NormalizedModule[];
}

export interface InstanceHealth {
  instanceId: string;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  selectorVersion: string;
  loginOk: boolean;
  updatedAt: string;
}

export const listInstances = async (apiBaseUrl?: string): Promise<InstanceSummary[]> => {
  const response = await jsonRequest<{ instances: InstanceSummary[] }>('/api/instances', undefined, false, apiBaseUrl);
  return response.instances;
};

export const createInstance = async (
  input: CreateInstanceInput,
  apiBaseUrl?: string,
): Promise<CreateInstanceResponse> => jsonRequest<CreateInstanceResponse>('/api/instances', {
  method: 'POST',
  body: JSON.stringify(input),
}, true, apiBaseUrl);

export const syncInstance = async (instanceId: string, apiBaseUrl?: string): Promise<SyncSummary> => {
  const response = await jsonRequest<{ summary: SyncSummary }>(
    `/api/instances/${encodeURIComponent(instanceId)}/sync`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    true,
    apiBaseUrl,
  );
  return response.summary;
};

export const loadInstanceModules = async (
  instanceId: string,
  apiBaseUrl?: string,
): Promise<NormalizedModulesPayload> =>
  jsonRequest<NormalizedModulesPayload>(`/api/instances/${encodeURIComponent(instanceId)}/modules`, undefined, false, apiBaseUrl);

export const loadInstanceHealth = async (instanceId: string, apiBaseUrl?: string): Promise<InstanceHealth> =>
  jsonRequest<InstanceHealth>(`/api/instances/${encodeURIComponent(instanceId)}/health`, undefined, false, apiBaseUrl);
