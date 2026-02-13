import crypto from 'node:crypto';
import type { NormalizedRule, RuleDateRange, RuleTarget } from '../types.js';
import { AppError } from '../errors.js';

const weekdayMap: Record<string, number> = {
  montag: 1,
  montags: 1,
  dienstag: 2,
  dienstags: 2,
  mittwoch: 3,
  mittwochs: 3,
  donnerstag: 4,
  donnerstags: 4,
  freitag: 5,
  freitags: 5,
  samstag: 6,
  samstags: 6,
  sonntag: 7,
  sonntags: 7,
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/\s+/g, ' ')
    .trim();

const denormalizeWeekday = (value: string): string =>
  value
    .replace('ae', 'ä')
    .replace('oe', 'ö')
    .replace('ue', 'ü');

const weekdayRegex = /(montag(?:s)?|dienstag(?:s)?|mittwoch(?:s)?|donnerstag(?:s)?|freitag(?:s)?|samstag(?:s)?|sonntag(?:s)?)/g;

const unique = (values: number[]): number[] => {
  const result: number[] = [];
  for (const value of values) {
    if (!result.includes(value)) {
      result.push(value);
    }
  }
  return result;
};

const createRange = (start: number, end: number): number[] => {
  if (start <= end) {
    return Array.from({ length: end - start + 1 }, (_unused, index) => start + index);
  }

  return [...Array.from({ length: 7 - start + 1 }, (_unused, index) => start + index), ...Array.from({ length: end }, (_unused, index) => index + 1)];
};

const toIsoDate = (year: number, month: number, day: number): string | null => {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
};

const normalizeTime = (hours: string, minutes: string): string | null => {
  const h = Number(hours);
  const m = Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const parseDaysOfWeek = (rawText: string): number[] => {
  const normalized = normalizeText(rawText);
  const rangeMatch = normalized.match(
    /(montag(?:s)?|dienstag(?:s)?|mittwoch(?:s)?|donnerstag(?:s)?|freitag(?:s)?|samstag(?:s)?|sonntag(?:s)?)\s+bis\s+(montag(?:s)?|dienstag(?:s)?|mittwoch(?:s)?|donnerstag(?:s)?|freitag(?:s)?|samstag(?:s)?|sonntag(?:s)?)/,
  );

  if (rangeMatch) {
    const startWord = denormalizeWeekday(rangeMatch[1]);
    const endWord = denormalizeWeekday(rangeMatch[2]);
    const start = weekdayMap[startWord];
    const end = weekdayMap[endWord];

    if (start && end) {
      return createRange(start, end);
    }
  }

  const matches = Array.from(normalized.matchAll(weekdayRegex));
  const days = matches
    .map((match) => weekdayMap[denormalizeWeekday(match[1])])
    .filter((value): value is number => typeof value === 'number');

  return unique(days).sort((a, b) => a - b);
};

export const parseTimeWindows = (rawText: string): { start: string; end: string }[] => {
  const windows: { start: string; end: string }[] = [];
  const pattern = /(\d{1,2})[:.](\d{2})\s*(?:uhr)?\s*(?:bis|\-|–|—|to)\s*(\d{1,2})[:.](\d{2})/gi;

  for (const match of rawText.matchAll(pattern)) {
    const start = normalizeTime(match[1], match[2]);
    const end = normalizeTime(match[3], match[4]);
    if (!start || !end) {
      continue;
    }

    windows.push({ start, end });
  }

  return windows;
};

export const parseDateRange = (rawText: string): RuleDateRange | undefined => {
  const normalized = normalizeText(rawText);

  const ymd = normalized.match(
    /(?:datum\s*(?:von)?\s*)?(\d{4})[\s./-](\d{1,2})[\s./-](\d{1,2})\s*(?:bis|\-|–|—)\s*(\d{4})[\s./-](\d{1,2})[\s./-](\d{1,2})/,
  );

  if (ymd) {
    const start = toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    const end = toIsoDate(Number(ymd[4]), Number(ymd[5]), Number(ymd[6]));
    if (start && end) {
      return { start, end };
    }
  }

  const dmy = normalized.match(/(?:vom\s*)?(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:bis|\-|–|—)\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);

  if (dmy) {
    const start = toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    const end = toIsoDate(Number(dmy[6]), Number(dmy[5]), Number(dmy[4]));
    if (start && end) {
      return { start, end };
    }
  }

  return undefined;
};

export const parseTarget = (rawText: string): RuleTarget | undefined => {
  const normalized = normalizeText(rawText);
  const numberMatch = rawText.match(/\+?[0-9][0-9\s/\-]{4,}/);

  if (/(rufnummer|nummer|ziel)/.test(normalized) && numberMatch) {
    return {
      type: 'number',
      value: numberMatch[0].replace(/\s+/g, ''),
    };
  }

  const userMatch = rawText.match(/(?:benutzer|user)\s*[:\-]\s*([^,;\n]+)/i);
  if (userMatch) {
    return {
      type: 'user',
      value: userMatch[1].trim(),
    };
  }

  const announcementMatch = rawText.match(/(?:ansage|audio)\s*[:\-]\s*([^,;\n]+)/i);
  if (announcementMatch) {
    return {
      type: 'announcement',
      value: announcementMatch[1].trim(),
    };
  }

  const mailboxMatch = rawText.match(/(?:mailbox|voicemail)\s*[:\-]\s*([^,;\n]+)/i);
  if (mailboxMatch) {
    return {
      type: 'mailbox',
      value: mailboxMatch[1].trim(),
    };
  }

  return undefined;
};

export interface ParseRuleResult {
  rule: NormalizedRule;
  warnings: string[];
}

const buildRuleId = (order: number, rawText: string): string =>
  `rule-${order + 1}-${crypto.createHash('sha1').update(rawText).digest('hex').slice(0, 10)}`;

export interface ParseRuleInput {
  rawText: string;
  label?: string;
  order: number;
  explicitTarget?: string;
  active?: boolean;
}

export const parseRuleText = (input: ParseRuleInput): ParseRuleResult => {
  const rawText = input.rawText.trim();
  if (!rawText) {
    throw new AppError('PARSE_FAILED', 'Leerer Regeltext kann nicht geparst werden', 422, { order: input.order });
  }

  const warnings: string[] = [];
  const daysOfWeek = parseDaysOfWeek(rawText);
  const timeWindows = parseTimeWindows(rawText);
  const dateRange = parseDateRange(rawText);
  const target = parseTarget(input.explicitTarget ? `${rawText}\n${input.explicitTarget}` : rawText);

  if (daysOfWeek.length === 0) {
    warnings.push(`Regel ${input.order + 1}: keine Wochentage erkannt`);
  }

  if (timeWindows.length === 0) {
    warnings.push(`Regel ${input.order + 1}: keine Zeitfenster erkannt (Full-Day angenommen)`);
  }

  const label = input.label?.trim() || rawText.split('\n')[0]?.trim() || `Rule ${input.order + 1}`;

  return {
    rule: {
      ruleId: buildRuleId(input.order, rawText),
      label,
      daysOfWeek,
      timeWindows,
      dateRange,
      target,
      order: input.order,
      rawText,
      active: input.active,
    },
    warnings,
  };
};

export const parseRulesFromTexts = (
  rawRules: Array<{ label?: string; rawText: string; targetText?: string; active?: boolean }>,
): ParseRuleResult[] => rawRules.map((entry, index) => parseRuleText({ rawText: entry.rawText, label: entry.label, order: index, explicitTarget: entry.targetText, active: entry.active }));
