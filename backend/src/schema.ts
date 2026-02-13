import { z } from 'zod';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createInstanceInputSchema = z.object({
  baseUrl: z.string().trim().min(1, 'baseUrl ist erforderlich'),
  username: z.string().trim().min(1, 'username ist erforderlich'),
  password: z.string().min(1, 'password ist erforderlich'),
  displayName: z.string().trim().min(1).max(120).optional(),
});

export const instanceIdParamSchema = z.object({
  instanceId: z.string().trim().min(3).max(120),
});

export const ruleTimeWindowSchema = z.object({
  start: z.string().regex(hhmmRegex),
  end: z.string().regex(hhmmRegex),
});

export const ruleDateRangeSchema = z.object({
  start: z.string().regex(isoDateRegex),
  end: z.string().regex(isoDateRegex),
});

export const normalizedRuleSchema = z.object({
  ruleId: z.string().min(1),
  label: z.string().min(1),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).default([]),
  timeWindows: z.array(ruleTimeWindowSchema).default([]),
  dateRange: ruleDateRangeSchema.optional(),
  target: z
    .object({
      type: z.enum(['number', 'user', 'announcement', 'mailbox', 'unknown']),
      value: z.string(),
    })
    .optional(),
  order: z.number().int().nonnegative(),
  rawText: z.string(),
  active: z.boolean().optional(),
});

export const normalizedModuleSchema = z.object({
  moduleId: z.string().min(1),
  moduleName: z.string().min(1),
  modulePhoneNumber: z.string().optional(),
  active: z.boolean().optional(),
  rules: z.array(normalizedRuleSchema),
});

export const normalizedModulesPayloadSchema = z.object({
  instanceId: z.string().min(1),
  fetchedAt: z.string().datetime(),
  selectorVersion: z.string().min(1),
  warnings: z.array(z.string()).default([]),
  modules: z.array(normalizedModuleSchema),
});

export type CreateInstanceInput = z.infer<typeof createInstanceInputSchema>;
export type NormalizedModulesPayloadInput = z.infer<typeof normalizedModulesPayloadSchema>;
