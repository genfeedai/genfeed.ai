import {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/enums';
import { z } from 'zod';
export const replyBotRateLimitsSchema = z.object({
  cooldownMinutes: z.number().min(0).max(60).default(5),
  maxDmsPerDay: z.number().min(0).max(200).default(20),
  maxDmsPerHour: z.number().min(0).max(50).default(5),
  maxRepliesPerDay: z.number().min(1).max(500).default(50),
  maxRepliesPerHour: z.number().min(1).max(100).default(10),
});
export const replyBotDmConfigSchema = z.object({
  context: z.string().max(2000).optional(),
  ctaLink: z.string().max(500).optional(),
  customInstructions: z.string().max(1000).optional(),
  delaySeconds: z.number().min(0).max(3600).default(60),
  enabled: z.boolean().default(false),
  offer: z.string().max(500).optional(),
  template: z.string().max(1000).optional(),
  useAiGeneration: z.boolean().default(true),
});
export const replyBotScheduleSchema = z.object({
  activeDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  activeHoursEnd: z.number().min(0).max(23).default(21),
  activeHoursStart: z.number().min(0).max(23).default(9),
  timezone: z.string().default('UTC'),
});
export const replyBotFiltersSchema = z.object({
  excludeKeywords: z.array(z.string()).default([]),
  includeKeywords: z.array(z.string()).default([]),
  languageFilter: z.array(z.string()).default([]),
  maxFollowers: z.number().min(0).optional(),
  minFollowers: z.number().min(0).default(0),
  mustHaveBio: z.boolean().default(false),
});
export const replyBotConfigSchema = z.object({
  actionType: z.nativeEnum(ReplyBotActionType),
  description: z.string().max(500).optional(),
  dmConfig: replyBotDmConfigSchema.optional(),
  filters: replyBotFiltersSchema.optional(),
  isActive: z.boolean().default(false),
  monitoredAccounts: z.array(z.string()).default([]),
  name: z.string().min(1, 'Name is required').max(100),
  platform: z.nativeEnum(ReplyBotPlatform),
  rateLimits: replyBotRateLimitsSchema.default({
    cooldownMinutes: 5,
    maxDmsPerDay: 20,
    maxDmsPerHour: 5,
    maxRepliesPerDay: 50,
    maxRepliesPerHour: 10,
  }),
  replyInstructions: z.string().optional(),
  replyTone: z.string().optional(),
  schedule: replyBotScheduleSchema.optional(),
  type: z.nativeEnum(ReplyBotType),
});
//# sourceMappingURL=reply-bot-config.schema.js.map
