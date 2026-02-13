import { describe, expect, it } from 'vitest';
import { parseDateRange, parseDaysOfWeek, parseRuleText, parseTimeWindows } from '../src/starface/parser.js';

describe('starface parser', () => {
  it('parses weekday range: montags bis freitags', () => {
    expect(parseDaysOfWeek('montags bis freitags')).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses individual weekdays', () => {
    expect(parseDaysOfWeek('montag, mittwoch und freitag')).toEqual([1, 3, 5]);
  });

  it('parses time windows', () => {
    expect(parseTimeWindows('08:00 bis 13:00 sowie 14:00-18:30')).toEqual([
      { start: '08:00', end: '13:00' },
      { start: '14:00', end: '18:30' },
    ]);
  });

  it('parses date ranges', () => {
    expect(parseDateRange('Datum von 2026 02 01 bis 2026 03 31')).toEqual({
      start: '2026-02-01',
      end: '2026-03-31',
    });
  });

  it('parses combination of weekdays, time and date', () => {
    const { rule } = parseRuleText({
      rawText: 'montags bis freitags 08:00 bis 13:00 Datum von 2026 02 01 bis 2026 03 31',
      order: 0,
      label: 'Regel 1',
    });

    expect(rule.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(rule.timeWindows).toEqual([{ start: '08:00', end: '13:00' }]);
    expect(rule.dateRange).toEqual({ start: '2026-02-01', end: '2026-03-31' });
    expect(rule.rawText).toContain('montags bis freitags');
  });
});
