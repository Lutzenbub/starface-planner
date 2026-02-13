import type { Module, ForwardingTarget } from '../types';
import type { NormalizedModulesPayload, RuleTarget } from './modulesApi';

const toLegacyWeekday = (day: number): number => {
  if (day === 7) {
    return 0;
  }
  if (day < 0) {
    return 0;
  }
  if (day > 6) {
    return day % 7;
  }
  return day;
};

const normalizeHexColor = (seed: string): string => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) & 0xffffffff;
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 65;
  const lightness = 42;

  const c = (1 - Math.abs((2 * lightness) / 100 - 1)) * (saturation / 100);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness / 100 - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (channel: number): string => {
    const value = Math.round((channel + m) * 255);
    return value.toString(16).padStart(2, '0');
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mapTargetType = (target: RuleTarget | undefined): ForwardingTarget => {
  if (!target) {
    return '';
  }

  switch (target.type) {
    case 'number':
      return 'Rufnummer';
    case 'mailbox':
      return 'Mailbox';
    case 'announcement':
      return 'Ansage';
    default:
      return '';
  }
};

export const mapNormalizedPayloadToModules = (payload: NormalizedModulesPayload): Module[] =>
  payload.modules.map((moduleEntry, moduleIndex) => {
    const firstTarget = moduleEntry.rules.find((rule) => Boolean(rule.target))?.target;

    return {
      id: moduleEntry.moduleId,
      name: moduleEntry.moduleName,
      phoneNumber: moduleEntry.modulePhoneNumber ?? '-',
      active: moduleEntry.active ?? true,
      order: moduleIndex,
      color: normalizeHexColor(moduleEntry.moduleId),
      forwardingTarget: mapTargetType(firstTarget),
      forwardingNumber: firstTarget?.type === 'number' ? firstTarget.value : undefined,
      forwardingMailbox: firstTarget?.type === 'mailbox' ? firstTarget.value : undefined,
      forwardingAnnouncement: firstTarget?.type === 'announcement' ? firstTarget.value : undefined,
      rules: moduleEntry.rules.map((rule) => ({
        id: rule.ruleId,
        weekdays: rule.daysOfWeek.map(toLegacyWeekday),
        dateRange: rule.dateRange,
        intervals: rule.timeWindows.map((window, index) => ({
          id: `${rule.ruleId}-interval-${index + 1}`,
          start: window.start,
          end: window.end,
        })),
      })),
    };
  });
