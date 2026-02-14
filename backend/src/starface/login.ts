import fs from 'node:fs/promises';
import path from 'node:path';
import type pino from 'pino';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
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

const isOauthUrl = (url: string): boolean =>
  url.toLowerCase().includes(selectorMap.oauth.realmUrlPattern.toLowerCase());

const isUiUrl = (url: string): boolean => {
  const normalized = url.toLowerCase();
  return normalized.includes('/?ui') || normalized.includes('?ui&') || normalized.endsWith('/?ui');
};

const isConfigDisplayUrl = (url: string): boolean => url.toLowerCase().includes('/config/display.do');

const waitForAnyUrl = async (
  page: Page,
  check: (url: string) => boolean,
  timeoutMs: number,
): Promise<void> => {
  await page.waitForURL((value) => check(value.toString()), { timeout: timeoutMs });
};

const hasLoginError = async (page: Page): Promise<boolean> => {
  for (const selector of selectorMap.login.errorBanner) {
    if ((await page.locator(selector).count()) > 0) {
      return true;
    }
  }
  return false;
};

const firstVisibleFromCandidates = async (candidates: Locator[]): Promise<Locator | null> => {
  for (const candidate of candidates) {
    const locator = candidate.first();
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        return locator;
      }
    } catch {
      // Continue with next fallback candidate.
    }
  }
  return null;
};

const findUsernameField = async (page: Page): Promise<Locator | null> => {
  const bySelector = await firstVisibleLocator(page, selectorMap.login.username);
  if (bySelector) {
    return bySelector;
  }

  return firstVisibleFromCandidates([
    page.getByLabel(/Benutzer|Benutzername|Username|E-Mail|ID/i),
    page.getByPlaceholder(/Benutzer|Benutzername|Username|E-Mail|ID/i),
    page.locator('input[type="text"]'),
    page.locator('input[type="email"]'),
  ]);
};

const findPasswordField = async (page: Page): Promise<Locator | null> => {
  const bySelector = await firstVisibleLocator(page, selectorMap.login.password);
  if (bySelector) {
    return bySelector;
  }

  return firstVisibleFromCandidates([
    page.getByLabel(/Passwort|Password/i),
    page.getByPlaceholder(/Passwort|Password/i),
    page.locator('input[type="password"]'),
  ]);
};

const findSubmitButton = async (page: Page): Promise<Locator | null> => {
  const bySelector = await firstVisibleLocator(page, selectorMap.login.submit);
  if (bySelector) {
    return bySelector;
  }

  return firstVisibleFromCandidates([
    page.getByRole('button', { name: /login|anmelden/i }),
    page.getByRole('link', { name: /login|anmelden/i }),
  ]);
};

const hasOauthForm = async (page: Page): Promise<boolean> => {
  const usernameField = await findUsernameField(page);
  const passwordField = await findPasswordField(page);
  return Boolean(usernameField && passwordField);
};

const findAdminChoice = async (page: Page): Promise<Locator | null> => {
  const bySelector = await firstVisibleLocator(page, selectorMap.entry.adminChoice);
  if (bySelector) {
    return bySelector;
  }

  return firstVisibleFromCandidates([
    page.getByRole('button', { name: /als administrator anmelden|administrator/i }),
    page.getByRole('link', { name: /als administrator anmelden|administrator/i }),
    page.getByText(/Als Administrator anmelden|Administrator/i),
  ]);
};

const findAdministrationButton = async (page: Page): Promise<Locator | null> =>
  firstVisibleFromCandidates([
    page.locator('td#config', { hasText: /Administration/i }),
    page.locator('td#config'),
    page.locator('td.caption-cursor', { hasText: /Administration/i }),
  ]);

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

const submitOauthForm = async (
  page: Page,
  username: string,
  password: string,
  timeoutMs: number,
  phase: 'primary' | 'admin',
): Promise<void> => {
  const usernameField = await findUsernameField(page);
  const passwordField = await findPasswordField(page);

  if (!usernameField || !passwordField) {
    throw new AppError('OAUTH_FORM_NOT_FOUND', 'OAuth Loginformular wurde nicht erkannt', 502, {
      phase,
      currentUrl: page.url(),
    });
  }

  await usernameField.fill(username);
  await passwordField.fill(password);

  const submitButton = await findSubmitButton(page);
  if (submitButton) {
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined),
      submitButton.click(),
    ]);
  } else {
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined),
      passwordField.press('Enter'),
    ]);
  }

  if (await hasLoginError(page)) {
    throw new AppError('OAUTH_LOGIN_FAILED', 'OAuth Login wurde von STARFACE abgelehnt', 401, {
      phase,
      currentUrl: page.url(),
    });
  }
};

const reuseStorageState = async (
  browser: Browser,
  options: LoginToStarfaceOptions,
): Promise<{ context: BrowserContext; page: Page } | null> => {
  if (!(await pathExists(options.instance.storageStatePath))) {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'storageState file not found');
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

  if (await hasOauthForm(page)) {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'storageState invalid (oauth form visible)');
    await context.close();
    return null;
  }

  if (!isConfigDisplayUrl(page.url())) {
    options.logger?.info(
      { instanceId: options.instance.instanceId, currentUrl: page.url() },
      'storageState invalid (not in /config/display.do)',
    );
    await context.close();
    return null;
  }

  await saveDebugScreenshot(page, options.debugDir, '05-config-display.png', options.debug);
  options.logger?.info({ instanceId: options.instance.instanceId }, 'storageState reuse successful');
  return { context, page };
};

const runFreshLoginV10 = async (
  browser: Browser,
  options: LoginToStarfaceOptions,
): Promise<{ context: BrowserContext; page: Page; requiredSecondLogin: boolean }> => {
  const context = await browser.newContext();
  const page = await context.newPage();

  options.logger?.info({ instanceId: options.instance.instanceId, baseUrl: options.instance.baseUrl }, 'Step 1: open STARFACE base URL');
  await page.goto(options.instance.baseUrl, {
    timeout: options.navigationTimeoutMs,
    waitUntil: 'domcontentloaded',
  });
  await saveDebugScreenshot(page, options.debugDir, '01-start.png', options.debug);

  if (!isUiUrl(page.url()) && !isConfigDisplayUrl(page.url()) && !(await hasOauthForm(page))) {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'Step 2: searching admin choice button');
    const adminChoice = await findAdminChoice(page);
    if (!adminChoice) {
      throw new AppError(
        'ADMIN_CHOICE_NOT_FOUND',
        'Admin-Auswahl "Als Administrator anmelden" wurde nicht gefunden',
        502,
        {
          currentUrl: page.url(),
        },
      );
    }

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => undefined),
      adminChoice.click(),
    ]);
    await saveDebugScreenshot(page, options.debugDir, '02-admin-choice.png', options.debug);

    try {
      await waitForAnyUrl(page, (url) => isOauthUrl(url) || isUiUrl(url), options.navigationTimeoutMs);
    } catch {
      if (!(await hasOauthForm(page))) {
        throw new AppError('OAUTH_FORM_NOT_FOUND', 'OAuth Loginformular nach Admin-Auswahl nicht gefunden', 502, {
          currentUrl: page.url(),
        });
      }
    }
  } else {
    await saveDebugScreenshot(page, options.debugDir, '02-admin-choice.png', options.debug);
  }

  let requiredSecondLogin = false;

  if (!isUiUrl(page.url()) && !isConfigDisplayUrl(page.url())) {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'Step 3: waiting for OAuth login form');
    if (!(await hasOauthForm(page))) {
      throw new AppError('OAUTH_FORM_NOT_FOUND', 'OAuth Loginformular wurde nicht erkannt', 502, {
        currentUrl: page.url(),
      });
    }

    await saveDebugScreenshot(page, options.debugDir, '03-oauth-form.png', options.debug);
    options.logger?.info({ instanceId: options.instance.instanceId }, 'Step 4: submit primary OAuth login');
    await submitOauthForm(
      page,
      options.instance.credentials.username,
      options.instance.credentials.password,
      options.loginTimeoutMs,
      'primary',
    );

    try {
      await waitForAnyUrl(page, (url) => isUiUrl(url) || isConfigDisplayUrl(url) || isOauthUrl(url), options.navigationTimeoutMs);
    } catch {
      throw new AppError('OAUTH_LOGIN_FAILED', 'OAuth Login war nicht erfolgreich', 401, {
        phase: 'primary',
        currentUrl: page.url(),
      });
    }

    if (isOauthUrl(page.url()) && (await hasOauthForm(page))) {
      throw new AppError('OAUTH_LOGIN_FAILED', 'OAuth Login blieb auf der Anmeldeseite', 401, {
        phase: 'primary',
        currentUrl: page.url(),
      });
    }
  }

  await saveDebugScreenshot(page, options.debugDir, '04-after-login-ui.png', options.debug);

  if (!isConfigDisplayUrl(page.url())) {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'Step 5: click Administration');
    const adminButton = await findAdministrationButton(page);
    if (!adminButton) {
      throw new AppError('ADMIN_BUTTON_NOT_FOUND', 'Administration Button wurde auf /?ui nicht gefunden', 502, {
        expectedSelector: selectorMap.dashboard.adminButton,
        currentUrl: page.url(),
      });
    }

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => undefined),
      adminButton.click(),
    ]);

    try {
      await waitForAnyUrl(page, (url) => isConfigDisplayUrl(url) || isOauthUrl(url), options.navigationTimeoutMs);
    } catch {
      throw new AppError('ADMIN_REDIRECT_FAILED', 'Nach Klick auf Administration wurde /config/display.do nicht erreicht', 502, {
        currentUrl: page.url(),
      });
    }

    if (isOauthUrl(page.url())) {
      requiredSecondLogin = true;
      options.logger?.info({ instanceId: options.instance.instanceId }, 'Step 6: second OAuth login in admin context');
      if (!(await hasOauthForm(page))) {
        throw new AppError('OAUTH_FORM_NOT_FOUND', 'Zweites OAuth Formular im Admin-Kontext nicht gefunden', 502, {
          phase: 'admin',
          currentUrl: page.url(),
        });
      }

      await submitOauthForm(
        page,
        options.instance.credentials.username,
        options.instance.credentials.password,
        options.loginTimeoutMs,
        'admin',
      );

      try {
        await waitForAnyUrl(page, (url) => isConfigDisplayUrl(url), options.navigationTimeoutMs);
      } catch {
        throw new AppError('ADMIN_REDIRECT_FAILED', 'Nach zweitem Login wurde /config/display.do nicht erreicht', 502, {
          phase: 'admin',
          currentUrl: page.url(),
        });
      }
    }
  }

  if (!isConfigDisplayUrl(page.url())) {
    throw new AppError('ADMIN_REDIRECT_FAILED', 'Login abgeschlossen, aber /config/display.do wurde nicht erreicht', 502, {
      currentUrl: page.url(),
    });
  }

  await saveDebugScreenshot(page, options.debugDir, '05-config-display.png', options.debug);
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
    'STARFACE login flow V10 started',
  );

  await ensureDirectory(path.dirname(options.instance.storageStatePath));

  const browser = await chromium.launch({
    headless: options.headless,
  });

  try {
    options.logger?.info({ instanceId: options.instance.instanceId }, 'Checking storageState reuse');
    const reused = await reuseStorageState(browser, options);
    if (reused) {
      options.logger?.info(
        {
          instanceId: options.instance.instanceId,
          durationMs: Date.now() - startedAt,
        },
        'STARFACE login flow V10 completed using storageState',
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

    options.logger?.info({ instanceId: options.instance.instanceId }, 'No valid storageState found, running fresh browser login');
    const fresh = await runFreshLoginV10(browser, options);
    await fresh.context.storageState({ path: options.instance.storageStatePath });

    options.logger?.info(
      {
        instanceId: options.instance.instanceId,
        requiredSecondLogin: fresh.requiredSecondLogin,
        durationMs: Date.now() - startedAt,
      },
      'STARFACE login flow V10 completed with fresh login',
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
      'STARFACE login flow V10 failed',
    );
    await browser.close().catch(() => undefined);
    throw error;
  }
};
