const removeTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const resolveApiBaseUrl = (apiBaseUrl?: string): string => {
  const raw = apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '';
  return removeTrailingSlash(raw);
};

const diagnosticsEnabled = import.meta.env.DEV || import.meta.env.VITE_DEBUG_API === 'true';

const createRequestId = (): string =>
  `api-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const logApi = (
  level: 'info' | 'warn' | 'error',
  message: string,
  metadata: Record<string, unknown>,
): void => {
  if (!diagnosticsEnabled) {
    return;
  }

  const prefix = '[starface-api]';
  if (level === 'error') {
    console.error(prefix, message, metadata);
    return;
  }

  if (level === 'warn') {
    console.warn(prefix, message, metadata);
    return;
  }

  console.info(prefix, message, metadata);
};

let warnedAboutGithubPagesOrigin = false;

const apiPath = (path: string, apiBaseUrl?: string): string => {
  const base = resolveApiBaseUrl(apiBaseUrl);
  if (
    !base &&
    !warnedAboutGithubPagesOrigin &&
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('github.io')
  ) {
    warnedAboutGithubPagesOrigin = true;
    logApi('warn', 'No VITE_API_BASE_URL configured on github.io host', {
      hostname: window.location.hostname,
      origin: window.location.origin,
      hint: 'Set repository variable VITE_API_BASE_URL to your deployed backend URL.',
    });
  }
  return `${base}${path}`;
};

const csrfTokenCache = new Map<string, string>();

const getCsrfToken = async (apiBaseUrl?: string): Promise<string> => {
  const base = resolveApiBaseUrl(apiBaseUrl);
  if (csrfTokenCache.has(base)) {
    logApi('info', 'Using cached CSRF token', { base });
    return csrfTokenCache.get(base) as string;
  }

  const requestId = createRequestId();
  const url = apiPath('/api/csrf', apiBaseUrl);
  const startedAt = performance.now();
  logApi('info', 'Fetching CSRF token', { requestId, url, base });

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    logApi('error', 'CSRF request failed before response', {
      requestId,
      url,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  logApi('info', 'CSRF response received', {
    requestId,
    status: response.status,
    ok: response.ok,
    durationMs,
  });

  if (!response.ok) {
    if (
      response.status === 404 &&
      typeof window !== 'undefined' &&
      window.location.hostname.endsWith('github.io') &&
      !resolveApiBaseUrl(apiBaseUrl)
    ) {
      throw new Error(
        'CSRF endpoint not found (404). GitHub Pages has no backend. Configure VITE_API_BASE_URL to your deployed backend.',
      );
    }
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
  const requestId = createRequestId();
  const url = apiPath(path, apiBaseUrl);
  const method = options.method ?? 'GET';
  const startedAt = performance.now();

  const headers = new Headers(options.headers ?? {});
  headers.set('Accept', 'application/json');

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  logApi('info', 'API request started', {
    requestId,
    method,
    url,
    requiresCsrf,
  });

  if (requiresCsrf) {
    headers.set('x-csrf-token', await getCsrfToken(apiBaseUrl));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    logApi('error', 'API request failed before response', {
      requestId,
      method,
      url,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  logApi('info', 'API response received', {
    requestId,
    method,
    url,
    status: response.status,
    ok: response.ok,
    durationMs,
  });

  if (!response.ok) {
    if (
      response.status === 404 &&
      typeof window !== 'undefined' &&
      window.location.hostname.endsWith('github.io') &&
      !resolveApiBaseUrl(apiBaseUrl)
    ) {
      throw new Error(
        `API endpoint ${path} not found (404). GitHub Pages hosts frontend only. Configure VITE_API_BASE_URL.`,
      );
    }
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as T;
};

export interface ApiHealthPayload {
  ok: boolean;
  service: string;
  timestamp: string;
}

export const loadApiHealth = async (apiBaseUrl?: string): Promise<ApiHealthPayload> =>
  jsonRequest<ApiHealthPayload>('/api/health', undefined, false, apiBaseUrl);

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
