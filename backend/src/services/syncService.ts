import { AppError, toAppError } from '../errors.js';
import type { InstanceStore } from '../stores/instanceStore.js';
import type { SyncResultStore } from '../stores/syncResultStore.js';
import type { StarfaceAutomation, StarfaceInstanceRecord, SyncSummary } from '../types.js';

export interface SyncServiceOptions {
  automation: StarfaceAutomation;
  instanceStore: InstanceStore;
  syncResultStore: SyncResultStore;
  syncTimeoutMs: number;
  syncCooldownMs: number;
}

const countRules = (payload: { modules: Array<{ rules: unknown[] }> }): number =>
  payload.modules.reduce((sum, moduleEntry) => sum + moduleEntry.rules.length, 0);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new AppError('INTERNAL_ERROR', timeoutMessage, 504));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export class SyncService {
  private readonly runningInstances = new Set<string>();
  private readonly lastSyncStartedAt = new Map<string, number>();

  public constructor(private readonly options: SyncServiceOptions) {}

  public async verifyInstanceLogin(instance: StarfaceInstanceRecord): Promise<void> {
    await this.options.automation.verifyLogin(instance);
    this.options.instanceStore.markLogin(instance.instanceId, true);
  }

  public async syncInstance(instance: StarfaceInstanceRecord): Promise<SyncSummary> {
    const now = Date.now();
    const lastStarted = this.lastSyncStartedAt.get(instance.instanceId);

    if (this.runningInstances.has(instance.instanceId)) {
      throw new AppError('SYNC_IN_PROGRESS', 'Fuer diese Instanz laeuft bereits ein Sync', 409);
    }

    if (lastStarted && now - lastStarted < this.options.syncCooldownMs) {
      throw new AppError(
        'SYNC_RATE_LIMITED',
        `Bitte ${Math.ceil((this.options.syncCooldownMs - (now - lastStarted)) / 1000)} Sekunden warten`,
        429,
      );
    }

    this.runningInstances.add(instance.instanceId);
    this.lastSyncStartedAt.set(instance.instanceId, now);

    try {
      const payload = await withTimeout(
        this.options.automation.scrapeModules(instance),
        this.options.syncTimeoutMs,
        'Sync-Timeout beim STARFACE-Scraping',
      );

      await this.options.syncResultStore.save(payload);
      this.options.instanceStore.markSyncSuccess(instance.instanceId, payload.fetchedAt);

      return {
        instanceId: instance.instanceId,
        fetchedAt: payload.fetchedAt,
        modulesCount: payload.modules.length,
        rulesCount: countRules(payload),
        warnings: payload.warnings,
      };
    } catch (error) {
      const mapped = toAppError(error);
      this.options.instanceStore.markSyncFailure(instance.instanceId, mapped.code, mapped.message);
      throw mapped;
    } finally {
      this.runningInstances.delete(instance.instanceId);
    }
  }
}
