import { Module, Rule, EvaluatedBlock, Conflict } from './types';
import { isWithinInterval, getDay, isSameDay, format } from 'date-fns';

// --- Time Helpers ---

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// --- Color Helpers ---

// Converts an HSL color value to RGB. Conversion formula
// adapted from http://en.wikipedia.org/wiki/HSL_color_space.
// Assumes h, s, and l are contained in the set [0, 1] and
// returns r, g, and b in the set [0, 255].
function hslToRgb(h: number, s: number, l: number) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Ensure the color is compatible with input[type="color"]
export const ensureHex = (color: string): string => {
  if (!color) return '#000000';
  if (color.startsWith('#')) return color;
  
  // Parse HSL string: "hsl(200, 70%, 35%)"
  const match = color.match(/hsl\((\d+(\.\d+)?),\s*(\d+(\.\d+)?)%,\s*(\d+(\.\d+)?)%\)/);
  if (match) {
    const h = parseFloat(match[1]) / 360;
    const s = parseFloat(match[3]) / 100;
    const l = parseFloat(match[5]) / 100;
    const [r, g, b] = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
  }
  
  return '#000000'; // Fallback
};

export const generateRandomColor = () => {
  const hue = Math.floor(Math.random() * 360) / 360;
  // Fixed saturation 70%, lightness 35% for dark colors
  const saturation = 0.7;
  const lightness = 0.35;
  
  const [r, g, b] = hslToRgb(hue, saturation, lightness);
  return rgbToHex(r, g, b);
};

// --- Date Helpers ---

const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// --- Rule Evaluation Engine ---

export const evaluateRulesForDate = (rules: Rule[], selectedDate: Date): { start: number, end: number, ruleId: string, intervalId: string }[] => {
  const result: { start: number, end: number, ruleId: string, intervalId: string }[] = [];
  
  // Helper to check date validity
  const isValidDate = (rule: Rule): boolean => {
    // 1. Specific Date
    if (rule.specificDate) {
      const specDate = parseLocalDate(rule.specificDate);
      if (!isSameDay(selectedDate, specDate)) return false;
    }

    // 2. Date Range
    if (rule.dateRange) {
      const start = parseLocalDate(rule.dateRange.start);
      const end = parseLocalDate(rule.dateRange.end);
      // Set times to ensure inclusive full-day comparison
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);
      
      if (!isWithinInterval(selectedDate, { start, end })) return false;
    }

    // 3. Weekdays
    if (rule.weekdays && rule.weekdays.length > 0) {
      const day = getDay(selectedDate); // 0 = Sun, 1 = Mon
      if (!rule.weekdays.includes(day)) return false;
    }

    return true;
  };

  rules.forEach(rule => {
    if (isValidDate(rule)) {
      if (!rule.intervals || rule.intervals.length === 0) {
        // Full day
        result.push({ start: 0, end: 1440, ruleId: rule.id, intervalId: 'full-day' });
      } else {
        rule.intervals.forEach(interval => {
          result.push({
            start: timeToMinutes(interval.start),
            end: timeToMinutes(interval.end),
            ruleId: rule.id,
            intervalId: interval.id
          });
        });
      }
    }
  });

  return result;
};

// --- Conflict Engine ---

const timeOverlap = (startA: number, endA: number, startB: number, endB: number) => {
  return startA < endB && startB < endA;
};

export const detectConflicts = (modules: Module[], selectedDate: Date): Conflict[] => {
  const activeModules = modules.filter(m => m.active);
  const evaluatedBlocks: EvaluatedBlock[] = [];

  // Flatten all active rules into comparable blocks
  activeModules.forEach(module => {
    const timeRanges = evaluateRulesForDate(module.rules, selectedDate);
    timeRanges.forEach(range => {
      evaluatedBlocks.push({
        moduleId: module.id,
        moduleName: module.name,
        phoneNumber: module.phoneNumber,
        startMinutes: range.start,
        endMinutes: range.end,
        priority: module.order,
        color: module.color,
        originalIntervalId: range.intervalId,
        originalRuleId: range.ruleId,
        forwardingTarget: module.forwardingTarget,
        forwardingNumber: module.forwardingNumber,
        forwardingMailbox: module.forwardingMailbox,
        forwardingAnnouncement: module.forwardingAnnouncement
      });
    });
  });

  const conflicts: Conflict[] = [];

  for (let i = 0; i < evaluatedBlocks.length; i++) {
    for (let j = i + 1; j < evaluatedBlocks.length; j++) {
      const blockA = evaluatedBlocks[i];
      const blockB = evaluatedBlocks[j];

      // Different phone numbers don't conflict in Starface (just parallel routing logic usually, but prompt says "Rufnummer identisch" is a conflict condition)
      if (blockA.phoneNumber !== blockB.phoneNumber) {
        continue;
      }

      if (timeOverlap(blockA.startMinutes, blockA.endMinutes, blockB.startMinutes, blockB.endMinutes)) {
        const conflictPair: Conflict = blockA.priority > blockB.priority
          ? { higher: blockB, lower: blockA } // B is higher priority (smaller index)
          : { higher: blockA, lower: blockB }; // A is higher priority

        conflicts.push(conflictPair);
      }
    }
  }

  return conflicts;
};

// --- Formatters ---

export const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
export const formatDisplayDate = (date: Date) => format(date, 'dd.MM.yyyy');
export const formatWeekDay = (date: Date) => format(date, 'EEEE');