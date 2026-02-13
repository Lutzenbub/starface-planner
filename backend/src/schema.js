import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isValidIsoDate = (value) => {
  if (!ISO_DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const timeToMinutes = (value) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const forwardingTargetSchema = z.enum([
  'Mailbox',
  'Audio',
  'Nummer',
  'Audio + Nummer',
  'Audio + Mailbox',
  'Ansage',
  'Rufnummer',
  'Ansage + Rufnummer',
  'Ansage + Mailbox',
  '',
]);

export const timeIntervalSchema = z
  .object({
    id: z.string().min(1),
    start: z.string().regex(HH_MM_REGEX, 'start must be HH:mm'),
    end: z.string().regex(HH_MM_REGEX, 'end must be HH:mm'),
  })
  .superRefine((interval, context) => {
    if (timeToMinutes(interval.start) >= timeToMinutes(interval.end)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'interval start must be before end',
        path: ['start'],
      });
    }
  });

export const ruleSchema = z
  .object({
    id: z.string().min(1),
    dateRange: z
      .object({
        start: z.string().refine(isValidIsoDate, 'start must be YYYY-MM-DD'),
        end: z.string().refine(isValidIsoDate, 'end must be YYYY-MM-DD'),
      })
      .optional(),
    specificDate: z.string().refine(isValidIsoDate, 'specificDate must be YYYY-MM-DD').optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    intervals: z.array(timeIntervalSchema).default([]),
  })
  .superRefine((rule, context) => {
    if (rule.dateRange && rule.dateRange.start > rule.dateRange.end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dateRange.start must be before or equal to dateRange.end',
        path: ['dateRange', 'start'],
      });
    }
  });

export const moduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phoneNumber: z.string().min(1),
  active: z.boolean(),
  order: z.number().int().min(0),
  color: z.string().min(1),
  rules: z.array(ruleSchema),
  forwardingTarget: forwardingTargetSchema.optional(),
  forwardingNumber: z.string().optional(),
  forwardingMailbox: z.string().optional(),
  forwardingAnnouncement: z.string().optional(),
});

export const modulesSchema = z.array(moduleSchema);
