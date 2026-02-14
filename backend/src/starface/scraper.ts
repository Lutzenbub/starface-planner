import type pino from 'pino';
import type { Page } from 'playwright';
import { AppError } from '../errors.js';
import type { NormalizedModule, NormalizedModulesPayload, StarfaceInstanceRecord } from '../types.js';
import { parseRuleText } from './parser.js';
import { selectorMap, selectorVersion } from './selectors.js';
import { anySelectorExists } from './dom.js';

interface RawRule {
  label?: string;
  rawText: string;
  orderHint?: string;
  targetText?: string;
  active?: boolean;
}

interface RawModule {
  moduleId: string;
  moduleName: string;
  modulePhoneNumber?: string;
  detailUrl?: string;
  active?: boolean;
  rawRules: RawRule[];
}

const parseOrder = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value.replace(/[^0-9]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const extractModulesOnPage = async (page: Page): Promise<RawModule[]> => {
  return page.evaluate((map) => {
    const firstText = (root: Element, selectors: readonly string[]): string => {
      for (const selector of selectors) {
        const element = root.querySelector(selector);
        if (element?.textContent?.trim()) {
          return element.textContent.trim();
        }
      }
      return '';
    };

    const firstAttribute = (root: Element, selectors: readonly string[], attr: string): string => {
      for (const selector of selectors) {
        const element = root.querySelector(selector);
        if (!element) {
          continue;
        }

        const value = element.getAttribute(attr);
        if (value?.trim()) {
          return value.trim();
        }
      }
      return '';
    };

    const moduleRows = map.modules.moduleRow
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element, index, array) => array.indexOf(element) === index);

    if (moduleRows.length === 0) {
      return [];
    }

    return moduleRows.map((row, moduleIndex) => {
      const name = firstText(row, map.modules.moduleName) || `Module ${moduleIndex + 1}`;
      const phone = firstText(row, map.modules.modulePhone);
      const detailUrl = firstAttribute(row, map.modules.moduleDetailLink, 'href');

      const ruleRows = map.modules.ruleRow
        .flatMap((selector) => Array.from(row.querySelectorAll(selector)))
        .filter((element, index, array) => array.indexOf(element) === index);

      const rawRules = ruleRows.map((ruleRow, ruleIndex) => {
        const ruleLabel = firstText(ruleRow, map.modules.ruleLabel);
        const rawText = firstText(ruleRow, map.modules.ruleText) || ruleRow.textContent?.trim() || '';
        const targetText = firstText(ruleRow, map.modules.ruleTarget);
        const orderHint = firstText(ruleRow, map.modules.ruleOrder);
        return {
          label: ruleLabel,
          rawText,
          orderHint,
          targetText,
          active: !ruleRow.classList.contains('inactive'),
          fallbackOrder: ruleIndex,
        };
      });

      const moduleId =
        (row as HTMLElement).dataset.moduleId ||
        row.getAttribute('data-id') ||
        row.getAttribute('id') ||
        `module-${moduleIndex + 1}`;

      return {
        moduleId,
        moduleName: name,
        modulePhoneNumber: phone,
        detailUrl,
        active: !row.classList.contains('inactive'),
        rawRules,
      };
    });
  }, selectorMap);
};

const extractRuleRowsOnCurrentPage = async (page: Page): Promise<RawRule[]> => {
  return page.evaluate((map) => {
    const firstText = (root: Element, selectors: readonly string[]): string => {
      for (const selector of selectors) {
        const element = root.querySelector(selector);
        if (element?.textContent?.trim()) {
          return element.textContent.trim();
        }
      }
      return '';
    };

    const ruleRows = map.modules.ruleRow
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element, index, array) => array.indexOf(element) === index);

    return ruleRows.map((ruleRow, index) => {
      const label = firstText(ruleRow, map.modules.ruleLabel);
      const rawText = firstText(ruleRow, map.modules.ruleText) || ruleRow.textContent?.trim() || '';
      const targetText = firstText(ruleRow, map.modules.ruleTarget);
      const orderHint = firstText(ruleRow, map.modules.ruleOrder);
      return {
        label,
        rawText,
        targetText,
        orderHint,
        active: !ruleRow.classList.contains('inactive'),
        fallbackOrder: index,
      };
    });
  }, selectorMap);
};

const checkModulesOverview = async (page: Page): Promise<void> => {
  const hasRows = await anySelectorExists(page, selectorMap.modules.moduleRow);
  if (!hasRows) {
    throw new AppError(
      'FRONTEND_CHANGED',
      'STARFACE Frontend Struktur geaendert: keine Modul-Zeilen gefunden',
      502,
      {
        missingSelectors: selectorMap.modules.moduleRow,
        selectorVersion,
      },
    );
  }
};

const resolveDetailUrl = (baseUrl: string, detailUrl: string): string => {
  try {
    return new URL(detailUrl, baseUrl).toString();
  } catch {
    return detailUrl;
  }
};

const navigateToOverview = async (page: Page, baseUrl: string): Promise<string> => {
  const attempts = selectorMap.modules.overviewUrls.map((entry) => new URL(entry, baseUrl).toString());

  for (const attempt of attempts) {
    try {
      const response = await page.goto(attempt, { waitUntil: 'domcontentloaded' });
      if (!response || response.ok()) {
        return attempt;
      }
    } catch {
      // Continue with next candidate URL.
    }
  }

  throw new AppError(
    'FRONTEND_CHANGED',
    'Keine bekannte STARFACE Modul-Uebersichtsseite erreichbar',
    502,
    { triedUrls: attempts, selectorVersion },
  );
};

const normalizeRawModules = (instance: StarfaceInstanceRecord, rawModules: RawModule[]): NormalizedModulesPayload => {
  const warnings: string[] = [];
  const modules: NormalizedModule[] = rawModules.map((rawModule, moduleIndex) => {
    const rules = rawModule.rawRules
      .filter((rule) => Boolean(rule.rawText?.trim()))
      .map((rawRule, ruleIndex) => {
        const order = parseOrder(rawRule.orderHint, ruleIndex);
        try {
          const parsed = parseRuleText({
            rawText: rawRule.rawText,
            label: rawRule.label,
            order,
            explicitTarget: rawRule.targetText,
            active: rawRule.active,
          });
          warnings.push(...parsed.warnings.map((warning) => `${rawModule.moduleName}: ${warning}`));
          return parsed.rule;
        } catch (error) {
          throw new AppError('PARSE_FAILED', 'Regeltext konnte nicht geparst werden', 422, {
            moduleId: rawModule.moduleId,
            moduleName: rawModule.moduleName,
            order,
            cause: error instanceof Error ? error.message : String(error),
          });
        }
      });

    if (rules.length === 0) {
      warnings.push(`${rawModule.moduleName}: keine Regeln erkannt`);
    }

    return {
      moduleId: rawModule.moduleId || `module-${moduleIndex + 1}`,
      moduleName: rawModule.moduleName,
      modulePhoneNumber: rawModule.modulePhoneNumber,
      active: rawModule.active,
      rules,
    };
  });

  return {
    instanceId: instance.instanceId,
    fetchedAt: new Date().toISOString(),
    selectorVersion,
    warnings,
    modules,
  };
};

export interface ScrapeModulesOptions {
  page: Page;
  instance: StarfaceInstanceRecord;
  logger?: pino.Logger;
}

export const scrapeModules = async ({ page, instance, logger }: ScrapeModulesOptions): Promise<NormalizedModulesPayload> => {
  const startedAt = Date.now();
  logger?.info(
    {
      instanceId: instance.instanceId,
      baseUrl: instance.baseUrl,
      selectorVersion,
    },
    'Scraper pipeline started',
  );

  const overviewUrl = await navigateToOverview(page, instance.baseUrl);
  logger?.info(
    {
      instanceId: instance.instanceId,
      overviewUrl,
    },
    'Modules overview opened',
  );
  await checkModulesOverview(page);

  const rawModules = await extractModulesOnPage(page);
  if (rawModules.length === 0) {
    throw new AppError(
      'FRONTEND_CHANGED',
      'Modul-Zeilen wurden erwartet, aber konnten nicht extrahiert werden',
      502,
      { selectorVersion },
    );
  }
  logger?.info(
    {
      instanceId: instance.instanceId,
      modulesDetected: rawModules.length,
    },
    'Modules extracted from overview',
  );

  for (const rawModule of rawModules) {
    if (rawModule.rawRules.length > 0 || !rawModule.detailUrl) {
      continue;
    }

    try {
      await page.goto(resolveDetailUrl(instance.baseUrl, rawModule.detailUrl), { waitUntil: 'domcontentloaded' });
      rawModule.rawRules = await extractRuleRowsOnCurrentPage(page);
      await page.goto(overviewUrl, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      logger?.warn(
        {
          instanceId: instance.instanceId,
          moduleId: rawModule.moduleId,
          moduleName: rawModule.moduleName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Modul-Detailseite konnte nicht gelesen werden',
      );
    }
  }

  const normalized = normalizeRawModules(instance, rawModules);
  logger?.info(
    {
      instanceId: instance.instanceId,
      modulesCount: normalized.modules.length,
      warningsCount: normalized.warnings.length,
      durationMs: Date.now() - startedAt,
    },
    'Scraper pipeline finished',
  );
  return normalized;
};

