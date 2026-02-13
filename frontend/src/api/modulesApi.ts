import { Module } from '../types';

const removeTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const resolveApiBaseUrl = (apiBaseUrl?: string): string => {
  const raw = apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '';
  return removeTrailingSlash(raw);
};

const modulesEndpoint = (apiBaseUrl?: string): string => `${resolveApiBaseUrl(apiBaseUrl)}/api/modules`;

const assertModulesArray = (value: unknown): Module[] => {
  if (!Array.isArray(value)) {
    throw new Error('API response is not an array');
  }
  return value as Module[];
};

export const loadModulesFromApi = async (apiBaseUrl?: string): Promise<Module[]> => {
  const response = await fetch(modulesEndpoint(apiBaseUrl));
  if (!response.ok) {
    throw new Error(`Load failed with status ${response.status}`);
  }
  const payload: unknown = await response.json();
  return assertModulesArray(payload);
};

export const saveModulesToApi = async (modules: Module[], apiBaseUrl?: string): Promise<void> => {
  const response = await fetch(modulesEndpoint(apiBaseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(modules),
  });

  if (!response.ok) {
    throw new Error(`Save failed with status ${response.status}`);
  }
};
