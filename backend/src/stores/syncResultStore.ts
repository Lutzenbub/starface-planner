import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizedModulesPayloadSchema } from '../schema.js';
import type { NormalizedModulesPayload } from '../types.js';

export class SyncResultStore {
  public constructor(private readonly baseDir: string) {}

  public async save(payload: NormalizedModulesPayload): Promise<void> {
    const validated = normalizedModulesPayloadSchema.parse(payload);
    await fs.mkdir(this.baseDir, { recursive: true });
    const file = this.resolveFile(validated.instanceId);
    await fs.writeFile(file, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  }

  public async load(instanceId: string): Promise<NormalizedModulesPayload | null> {
    const file = this.resolveFile(instanceId);
    try {
      const content = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(content);
      return normalizedModulesPayloadSchema.parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private resolveFile(instanceId: string): string {
    return path.join(this.baseDir, `${instanceId}.json`);
  }
}
