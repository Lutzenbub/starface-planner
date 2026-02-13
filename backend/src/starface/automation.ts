import fs from 'node:fs/promises';
import type pino from 'pino';
import type { AppConfig } from '../config.js';
import type { LoginMetadata, NormalizedModulesPayload, StarfaceAutomation, StarfaceInstanceRecord } from '../types.js';
import { loginToStarface } from './login.js';
import { scrapeModules } from './scraper.js';

const ensureDirectory = async (directory: string): Promise<void> => {
  await fs.mkdir(directory, { recursive: true });
};

export class PlaywrightStarfaceAutomation implements StarfaceAutomation {
  public constructor(private readonly config: AppConfig, private readonly logger?: pino.Logger) {}

  public async verifyLogin(instance: StarfaceInstanceRecord): Promise<LoginMetadata> {
    await ensureDirectory(this.config.authDir);

    const session = await loginToStarface({
      instance,
      debug: this.config.debug,
      debugDir: this.config.debugDir,
      loginTimeoutMs: this.config.loginTimeoutMs,
      navigationTimeoutMs: this.config.navigationTimeoutMs,
      headless: this.config.playwrightHeadless,
      logger: this.logger,
    });

    const metadata: LoginMetadata = {
      usedStorageState: session.usedStorageState,
      requiredSecondLogin: session.requiredSecondLogin,
      storageStatePath: session.storageStatePath,
    };

    await session.context.close();
    await session.browser.close();
    return metadata;
  }

  public async scrapeModules(instance: StarfaceInstanceRecord): Promise<NormalizedModulesPayload> {
    await ensureDirectory(this.config.authDir);

    const session = await loginToStarface({
      instance,
      debug: this.config.debug,
      debugDir: this.config.debugDir,
      loginTimeoutMs: this.config.loginTimeoutMs,
      navigationTimeoutMs: this.config.navigationTimeoutMs,
      headless: this.config.playwrightHeadless,
      logger: this.logger,
    });

    try {
      return await scrapeModules({
        page: session.page,
        instance,
        logger: this.logger,
      });
    } finally {
      await session.context.close();
      await session.browser.close();
    }
  }
}

export class MockStarfaceAutomation implements StarfaceAutomation {
  public constructor(private readonly payloadFactory?: (instance: StarfaceInstanceRecord) => NormalizedModulesPayload) {}

  public async verifyLogin(instance: StarfaceInstanceRecord): Promise<LoginMetadata> {
    return {
      usedStorageState: false,
      requiredSecondLogin: false,
      storageStatePath: instance.storageStatePath,
    };
  }

  public async scrapeModules(instance: StarfaceInstanceRecord): Promise<NormalizedModulesPayload> {
    if (this.payloadFactory) {
      return this.payloadFactory(instance);
    }

    return {
      instanceId: instance.instanceId,
      fetchedAt: new Date().toISOString(),
      selectorVersion: 'mock-v1',
      warnings: [],
      modules: [
        {
          moduleId: 'mock-module-1',
          moduleName: 'Mock Modul',
          modulePhoneNumber: '004928722411242',
          rules: [
            {
              ruleId: 'mock-rule-1',
              label: 'Mock Regel',
              daysOfWeek: [1, 2, 3, 4, 5],
              timeWindows: [{ start: '08:00', end: '13:00' }],
              dateRange: { start: '2026-02-01', end: '2026-03-31' },
              target: { type: 'number', value: '+49491234567' },
              order: 1,
              rawText: 'montags bis freitags 08:00 bis 13:00 Datum von 2026 02 01 bis 2026 03 31',
            },
          ],
        },
      ],
    };
  }
}
