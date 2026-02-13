import type { Locator, Page } from 'playwright';

export const firstVisibleLocator = async (page: Page, selectors: readonly string[]): Promise<Locator | null> => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        return locator;
      }
    } catch {
      // Continue with fallback selectors.
    }
  }

  return null;
};

export const anySelectorExists = async (page: Page, selectors: readonly string[]): Promise<boolean> => {
  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      return true;
    }
  }
  return false;
};

export const collectMissingSelectors = async (page: Page, selectors: readonly string[]): Promise<string[]> => {
  const missing: string[] = [];
  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    if (count === 0) {
      missing.push(selector);
    }
  }
  return missing;
};
