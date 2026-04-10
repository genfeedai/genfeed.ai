import {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/enums';
import { z } from 'zod';
export declare const replyBotRateLimitsSchema: z.ZodObject<
  {
    cooldownMinutes: z.ZodDefault<z.ZodNumber>;
    maxDmsPerDay: z.ZodDefault<z.ZodNumber>;
    maxDmsPerHour: z.ZodDefault<z.ZodNumber>;
    maxRepliesPerDay: z.ZodDefault<z.ZodNumber>;
    maxRepliesPerHour: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strip
>;
export declare const replyBotDmConfigSchema: z.ZodObject<
  {
    context: z.ZodOptional<z.ZodString>;
    ctaLink: z.ZodOptional<z.ZodString>;
    customInstructions: z.ZodOptional<z.ZodString>;
    delaySeconds: z.ZodDefault<z.ZodNumber>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    offer: z.ZodOptional<z.ZodString>;
    template: z.ZodOptional<z.ZodString>;
    useAiGeneration: z.ZodDefault<z.ZodBoolean>;
  },
  z.core.$strip
>;
export declare const replyBotScheduleSchema: z.ZodObject<
  {
    activeDays: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    activeHoursEnd: z.ZodDefault<z.ZodNumber>;
    activeHoursStart: z.ZodDefault<z.ZodNumber>;
    timezone: z.ZodDefault<z.ZodString>;
  },
  z.core.$strip
>;
export declare const replyBotFiltersSchema: z.ZodObject<
  {
    excludeKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
    includeKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
    languageFilter: z.ZodDefault<z.ZodArray<z.ZodString>>;
    maxFollowers: z.ZodOptional<z.ZodNumber>;
    minFollowers: z.ZodDefault<z.ZodNumber>;
    mustHaveBio: z.ZodDefault<z.ZodBoolean>;
  },
  z.core.$strip
>;
export declare const replyBotConfigSchema: z.ZodObject<
  {
    actionType: z.ZodEnum<typeof ReplyBotActionType>;
    description: z.ZodOptional<z.ZodString>;
    dmConfig: z.ZodOptional<
      z.ZodObject<
        {
          context: z.ZodOptional<z.ZodString>;
          ctaLink: z.ZodOptional<z.ZodString>;
          customInstructions: z.ZodOptional<z.ZodString>;
          delaySeconds: z.ZodDefault<z.ZodNumber>;
          enabled: z.ZodDefault<z.ZodBoolean>;
          offer: z.ZodOptional<z.ZodString>;
          template: z.ZodOptional<z.ZodString>;
          useAiGeneration: z.ZodDefault<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    filters: z.ZodOptional<
      z.ZodObject<
        {
          excludeKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
          includeKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
          languageFilter: z.ZodDefault<z.ZodArray<z.ZodString>>;
          maxFollowers: z.ZodOptional<z.ZodNumber>;
          minFollowers: z.ZodDefault<z.ZodNumber>;
          mustHaveBio: z.ZodDefault<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    isActive: z.ZodDefault<z.ZodBoolean>;
    monitoredAccounts: z.ZodDefault<z.ZodArray<z.ZodString>>;
    name: z.ZodString;
    platform: z.ZodEnum<typeof ReplyBotPlatform>;
    rateLimits: z.ZodDefault<
      z.ZodObject<
        {
          cooldownMinutes: z.ZodDefault<z.ZodNumber>;
          maxDmsPerDay: z.ZodDefault<z.ZodNumber>;
          maxDmsPerHour: z.ZodDefault<z.ZodNumber>;
          maxRepliesPerDay: z.ZodDefault<z.ZodNumber>;
          maxRepliesPerHour: z.ZodDefault<z.ZodNumber>;
        },
        z.core.$strip
      >
    >;
    replyInstructions: z.ZodOptional<z.ZodString>;
    replyTone: z.ZodOptional<z.ZodString>;
    schedule: z.ZodOptional<
      z.ZodObject<
        {
          activeDays: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
          activeHoursEnd: z.ZodDefault<z.ZodNumber>;
          activeHoursStart: z.ZodDefault<z.ZodNumber>;
          timezone: z.ZodDefault<z.ZodString>;
        },
        z.core.$strip
      >
    >;
    type: z.ZodEnum<typeof ReplyBotType>;
  },
  z.core.$strip
>;
export type ReplyBotConfigSchema = z.infer<typeof replyBotConfigSchema>;
export type ReplyBotRateLimitsSchema = z.infer<typeof replyBotRateLimitsSchema>;
export type ReplyBotDmConfigSchema = z.infer<typeof replyBotDmConfigSchema>;
export type ReplyBotScheduleSchema = z.infer<typeof replyBotScheduleSchema>;
export type ReplyBotFiltersSchema = z.infer<typeof replyBotFiltersSchema>;
//# sourceMappingURL=reply-bot-config.schema.d.ts.map
