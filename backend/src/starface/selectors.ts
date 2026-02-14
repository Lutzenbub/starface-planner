export const selectorMap = {
  version: 'starface-cloud-v10-2026-02-14',
  entry: {
    adminChoice: [
      'a:has-text("Als Administrator anmelden")',
      'button:has-text("Als Administrator anmelden")',
      'a:has-text("Administrator")',
      'button:has-text("Administrator")',
    ],
  },
  oauth: {
    realmUrlPattern: '/auth/realms/pbx',
    uiUrlPattern: '/?ui',
  },
  login: {
    username: [
      'input[name="id"]',
      'input#id',
      'input[placeholder="ID"]',
      'input[placeholder*="id" i]',
      'input[name="username"]',
      'input#username',
      'input[type="text"][name*="user" i]',
      'input[type="email"]',
    ],
    password: ['input[name="password"]', 'input#password', 'input[type="password"]'],
    submit: [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Anmelden")',
    ],
    errorBanner: ['.error', '.alert-danger', '.login-error', '[data-testid="login-error"]'],
  },
  dashboard: {
    adminButton: 'td#config',
    adminButtonFallback: ['td#config', 'td.caption-cursor:has-text("Administration")'],
  },
  admin: {
    entryUrlPattern: '/config/display.do',
    rootMarkers: ['body', 'form', '#content'],
  },
  modules: {
    // TODO: Echte STARFACE-Selektoren fuer Moduluebersicht eintragen.
    overviewUrls: ['/config/display.do', '/config/modules.do', '/config/modules/index.do'],
    moduleRow: ['tr.module-row', '.module-row', '[data-module-id]'],
    moduleName: ['.module-name', '[data-module-name]', 'td.name'],
    modulePhone: ['.module-phone', '[data-module-phone]', 'td.phone'],
    moduleDetailLink: ['a.module-detail', 'a[href*="module"]'],
    ruleRow: ['tr.rule-row', '.rule-row', '[data-rule-id]'],
    ruleLabel: ['.rule-label', '[data-rule-label]', '.name'],
    ruleText: ['.rule-text', '[data-rule-text]', '.description'],
    ruleOrder: ['.rule-order', '[data-rule-order]', '.position'],
    ruleTarget: ['.rule-target', '[data-rule-target]', '.target'],
  },
} as const;

export const selectorVersion = selectorMap.version;
