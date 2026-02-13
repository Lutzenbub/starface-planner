import path from 'node:path';
import type { InstanceHealth, InstanceSummary, StarfaceInstanceRecord } from '../types.js';
import { createInstanceId } from '../utils/ids.js';

const nowIso = () => new Date().toISOString();

export class InstanceStore {
  private readonly instancesById = new Map<string, StarfaceInstanceRecord>();
  private readonly instancesByBaseUrl = new Map<string, string>();
  private readonly healthByInstanceId = new Map<string, InstanceHealth>();

  public constructor(private readonly authDir: string, private readonly selectorVersion: string) {}

  public upsert(params: {
    baseUrl: string;
    username: string;
    password: string;
    displayName?: string;
  }): StarfaceInstanceRecord {
    const existingId = this.instancesByBaseUrl.get(params.baseUrl);
    const timestamp = nowIso();

    if (existingId) {
      const existing = this.instancesById.get(existingId);
      if (!existing) {
        this.instancesByBaseUrl.delete(params.baseUrl);
      } else {
        const updated: StarfaceInstanceRecord = {
          ...existing,
          displayName: params.displayName ?? existing.displayName,
          credentials: {
            username: params.username,
            password: params.password,
          },
          updatedAt: timestamp,
        };
        this.instancesById.set(updated.instanceId, updated);
        this.ensureHealth(updated.instanceId);
        return updated;
      }
    }

    const instanceId = createInstanceId(params.baseUrl);
    const created: StarfaceInstanceRecord = {
      instanceId,
      baseUrl: params.baseUrl,
      displayName: params.displayName,
      credentials: {
        username: params.username,
        password: params.password,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      storageStatePath: path.join(this.authDir, `${instanceId}.json`),
    };

    this.instancesById.set(instanceId, created);
    this.instancesByBaseUrl.set(params.baseUrl, instanceId);
    this.ensureHealth(instanceId);
    return created;
  }

  public listSummaries(): InstanceSummary[] {
    return Array.from(this.instancesById.values())
      .map((instance) => ({
        instanceId: instance.instanceId,
        baseUrl: instance.baseUrl,
        displayName: instance.displayName,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  public getById(instanceId: string): StarfaceInstanceRecord | undefined {
    return this.instancesById.get(instanceId);
  }

  public getHealth(instanceId: string): InstanceHealth | undefined {
    return this.healthByInstanceId.get(instanceId);
  }

  public markLogin(instanceId: string, loginOk: boolean): void {
    const health = this.ensureHealth(instanceId);
    health.loginOk = loginOk;
    health.updatedAt = nowIso();
    this.healthByInstanceId.set(instanceId, health);
  }

  public markSyncSuccess(instanceId: string, timestamp: string): void {
    const health = this.ensureHealth(instanceId);
    health.lastSuccessfulSyncAt = timestamp;
    health.lastError = null;
    health.lastErrorCode = null;
    health.updatedAt = nowIso();
    this.healthByInstanceId.set(instanceId, health);
  }

  public markSyncFailure(instanceId: string, errorCode: string, message: string): void {
    const health = this.ensureHealth(instanceId);
    health.lastErrorCode = errorCode;
    health.lastError = message;
    health.updatedAt = nowIso();
    this.healthByInstanceId.set(instanceId, health);
  }

  private ensureHealth(instanceId: string): InstanceHealth {
    const existing = this.healthByInstanceId.get(instanceId);
    if (existing) {
      return existing;
    }

    const health: InstanceHealth = {
      instanceId,
      lastSuccessfulSyncAt: null,
      lastError: null,
      lastErrorCode: null,
      selectorVersion: this.selectorVersion,
      loginOk: false,
      updatedAt: nowIso(),
    };

    this.healthByInstanceId.set(instanceId, health);
    return health;
  }
}
