import fs from 'node:fs/promises';
import path from 'node:path';
import type pino from 'pino';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { AppError } from '../errors.js';
import type { LoginMetadata, StarfaceInstanceRecord } from '../types.js';
import { selectorMap } from './selectors.js';
import { firstVisibleLocator } from './dom.js';

export interface LoginToStarfaceOptions {
  instance: StarfaceInstanceRecord;
  debug: boolean;
  debugDir: string;
  loginTimeoutMs: number;
  navigationTimeoutMs: number;
  headless: boolean;
  logger?: pino.Logger;
}

export interface LoginSession extends LoginMetadata {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const pathExists = async (file: string): Promise<boolean> => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

const ensureDirectory = async (directory: string): Promise<void> => {
  await fs.mkdir(directory, { recursive: true });
};

const adminUrl = (baseUrl: string): string => `${baseUrl.replace(/\/$/, '')}/config/display.do`;

const hasLoginForm = async (page: Page): Promise<boolean> => {
  const username = await firstVisibleLocator(page, selectorMap.login.username);
  const password = await firstVisibleLocator(page, selectorMap.login.password);
  return Boolean(username && password);
};

const hasLoginError = async (page: Page): Promise<boolean> => {
  for (const selector of selectorMap.login.errorBanner) {
    if ((await page.locator(selector).count()) > 0) {
      return true;
    }
  }
  return false;
};

const saveDebugScreenshot = async (
  page: Page,
  debugDir: string,
  fileName: string,
  enabled: boolean,
): Promise<void> => {
  if (!enabled) {
    return;
  }

  await ensureDirectory(debugDir);
  await page.screenshot({
    path: path.join(debugDir, fileName),
    fullPage: true,
  });
};

const submitLoginForm = async (
  page: Page,
  username: string,
  password: string,
  timeoutMs: number,
): Promise<void> => {
  const usernameField = await firstVisibleLocator(page, selectorMap.login.username);
  const passwordField = await firstVisibleLocator(page, selectorMap.login.password);

  if (!usernameField || !passwordField) {
    throw new AppError('LOGIN_FAILED', 'Loginformular wurde nicht erkannt', 401);
  }

  await usernameField.fill(username);
  await passwordField.fill(password);

  const submitButton = await firstVisibleLocator(page, selectorMap.login.submit);
  if (submitButton) {
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined),
      submitButton.click(),
    ]);
    return;
  }

  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined),
    passwordField.press('Enter'),
  ]);
};

const waitForDashboard = async (page: Page, timeoutMs: number): Promise<void> => {
  try {
    await page.waitForFunction(
      () => {
        const element = document.querySelector('td#config');
        if (!element) {
          return false;
        }
        const text = element.textContent?.trim().toLowerCase() ?? '';
        return text.includes('administration');
      },
      undefined,
      { timeout: timeoutMs },
    );
  } catch {
    if (await hasLoginError(page)) {
      throw new AppError('LOGIN_FAILED', 'Login fehlgeschlagen: STARFACE hat die Anmeldung abgelehnt', 401);
    }
    throw new AppError(
      'ADMIN_BUTTON_NOT_FOUND',
      'STARFACE Frontend Struktur hat sich geaendert oder Login war nicht erfolgreich: Administration Button fehlt',
      502,
      { expectedSelector: selectorMap.dashboard.adminButton },
    );
  }
};

const clickAdministration = async (page: Page, timeoutMs: number): Promise<void> => {
  const adminButton = page
    .locator(selectorMap.dashboard.adminButton, {
      hasText: /Administration/i,
    })
    .first();

  const fallbackAdminButton = page.locator(selectorMap.dashboard.adminButton).first();

  if ((await adminButton.count()) === 0) {
    if ((await fallbackAdminButton.count()) === 0) {
      throw new AppError(
        'ADMIN_BUTTON_NOT_FOUND',
        'STARFACE Frontend Struktur hat sich geaendert oder Login war nicht erfolgreich',
        502,
        { expectedSelector: selectorMap.dashboard.adminButton },
      );
    }
  }

  try {
    await Promise.all([
      page.waitForURL('**/config/display.do**', { timeout: timeoutMs }),
      (await adminButton.count()) > 0 ? adminButton.click() : fallbackAdminButton.click(),
    ]);
  } catch {
    throw new AppError(
      'ADMIN_REDIRECT_FAILED',
      'Administration wurde geklickt, aber /config/display.do wurde nicht erreicht',
      502,
    );
  }
};

const reuseStorageState = async (
  browser: Browser,
  options: LoginToStarfaceOptions,
): Promise<{ context: BrowserContext; page: Page } | null> => {
  if (!(await pathExists(options.instance.storageStatePath))) {
    options.logger?.info(
      {
        instanceId: options.instance.instanceId,
      },
      'storageState file not found',
    );
    return null;
  }

  const context = await browser.newContext({
    storageState: options.instance.storageStatePath,
  });

  const page = await context.newPage();
  await page.goto(adminUrl(options.instance.baseUrl), {
    timeout: options.navigationTimeoutMs,
    waitUntil: 'domcontentloaded',
  });

  if (await hasLoginForm(page)) {
    options.logger?.info(
      {
        instanceId: options.instance.instanceId,
      },
      'storageState invalid (login form still shown)',
    );
    await context.close();
    return null;
  }

  options.logger?.info(
    {
      instanceId: options.instance.instanceId,
    },
    'storageState reuse successful',
  );
  return { context, page };
};

const runFreshLogin = async (
  browser: Browser,
  options: LoginToStarfaceOptions,
): Promise<{ context: BrowserContext; page: Page; requiredSecondLogin: boolean }> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  options.logger?.info({ instanceId: options.instance.instanceId }, 'Opening STARFACE base URL');

  await page.goto(options.instance.baseUrl, {
    timeout: options.navigationTimeoutMs,
    waitUntil: 'domcontentloaded',
  });

  if (await hasLoginForm(page)) {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'Submitting first login form');
    await submitLoginForm(
      page,
      options.instance.credentials.username,
      options.instance.credentials.password,
      options.loginTimeoutMs,
    );
  } else {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'No first login form detected');
  }

  options.logger?.info({ instanceId: options.instance.instanceId }, 'Waiting for dashboard/admin button');
  await waitForDashboard(page, options.loginTimeoutMs);
  await saveDebugScreenshot(page, options.debugDir, 'login-dashboard.png', options.debug);

  options.logger?.info({ instanceId: options.instance.instanceId }, 'Clicking Administration button');
  await clickAdministration(page, options.navigationTimeoutMs);
  await saveDebugScreenshot(page, options.debugDir, 'admin-config.png', options.debug);

  let requiredSecondLogin = false;
  if (await hasLoginForm(page)) {
    requiredSecondLogin = true;
    options.logger?.info({ instanceId: options.instance.instanceId }, 'Second login form detected, submitting');
    await submitLoginForm(
      page,
      options.instance.credentials.username,
      options.instance.credentials.password,
      options.loginTimeoutMs,
    );

    try {
      await page.waitForURL('**/config/display.do**', { timeout: options.navigationTimeoutMs });
    } catch {
      throw new AppError(
        'ADMIN_REDIRECT_FAILED',
        'Zweiter Login erfolgreich, aber /config/display.do nicht erreichbar',
        502,
      );
    }
  } else {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'No second login form detected');
  }

  if (await hasLoginForm(page)) {
    throw new AppError('LOGIN_FAILED', 'Login im Administrationsbereich fehlgeschlagen', 401);
  }

  return { context, page, requiredSecondLogin };
};

export const loginToStarface = async (options: LoginToStarfaceOptions): Promise<LoginSession> => {
  const startedAt = Date.now();
  options.logger?.info(
    {
      instanceId: options.instance.instanceId,
      baseUrl: options.instance.baseUrl,
      storageStatePath: options.instance.storageStatePath,
      headless: options.headless,
      debug: options.debug,
    },
    'STARFACE login flow started',
  );

  await ensureDirectory(path.dirname(options.instance.storageStatePath));

  const browser = await chromium.launch({
    headless: options.headless,
  });

  try {
    options.logger?.info(
      {
        instanceId: options.instance.instanceId,
      },
      'Checking storageState reuse',
    );
    const reused = await reuseStorageState(browser, options);
    if (reused) {
      options.logger?.info(
        {
          instanceId: options.instance.instanceId,
          durationMs: Date.now() - startedAt,
        },
        'STARFACE login flow completed using storageState',
      );
      return {
        browser,
        context: reused.context,
        page: reused.page,
        usedStorageState: true,
        requiredSecondLogin: false,
        storageStatePath: options.instance.storageStatePath,
      };
    }

    options.logger?.info(
      {
        instanceId: options.instance.instanceId,
      },
      'No valid storageState found, running fresh login',
    );
    const fresh = await runFreshLogin(browser, options);
    await fresh.context.storageState({ path: options.instance.storageStatePath });
    options.logger?.info(
      {
        instanceId: options.instance.instanceId,
        requiredSecondLogin: fresh.requiredSecondLogin,
        durationMs: Date.now() - startedAt,
      },
      'STARFACE login flow completed with fresh login',
    );

    return {
      browser,
      context: fresh.context,
      page: fresh.page,
      usedStorageState: false,
      requiredSecondLogin: fresh.requiredSecondLogin,
      storageStatePath: options.instance.storageStatePath,
    };
  } catch (error) {
    options.logger?.error(
      {
        instanceId: options.instance.instanceId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      'STARFACE login flow failed',
    );
    await browser.close().catch(() => undefined);
    throw error;
  }
};
