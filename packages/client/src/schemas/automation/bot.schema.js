import {
  BotPlatform,
  EngagementAction,
  MonitoringAlertType,
  PublishingFrequency,
} from '@genfeedai/enums';
import { z } from 'zod';
export const botLivestreamMessageTypes = [
  'scheduled_link_drop',
  'scheduled_host_prompt',
  'context_aware_question',
];
export const botLivestreamTargetAudiences = ['hosts', 'audience'];
export const botResponseTemplateSchema = z.object({
  response: z.string().min(1, 'Response is required'),
  trigger: z.string().min(1, 'Trigger is required'),
});
export const botLivestreamTargetSchema = z.object({
  channelId: z.string().min(1, 'Channel ID is required'),
  channelLabel: z.string().optional(),
  channelUrl: z.string().url().optional(),
  credentialId: z.string().optional(),
  isEnabled: z.boolean().default(true),
  liveChatId: z.string().optional(),
  platform: z.enum([BotPlatform.TWITCH, BotPlatform.YOUTUBE]),
  senderId: z.string().optional(),
});
export const botLivestreamLinkSchema = z.object({
  id: z.string().min(1, 'Link ID is required'),
  label: z.string().min(1, 'Link label is required'),
  url: z.string().url('A valid URL is required'),
});
export const botLivestreamMessageTemplateSchema = z.object({
  enabled: z.boolean().default(true),
  id: z.string().min(1, 'Template ID is required'),
  platforms: z
    .array(z.enum([BotPlatform.TWITCH, BotPlatform.YOUTUBE]))
    .default([]),
  text: z.string().min(1, 'Template text is required'),
  type: z.enum(botLivestreamMessageTypes),
});
export const botLivestreamSettingsSchema = z.object({
  automaticPosting: z.boolean().default(true),
  links: z.array(botLivestreamLinkSchema).default([]),
  manualOverrideTtlMinutes: z.number().min(1).max(120).default(15),
  maxAutoPostsPerHour: z.number().min(1).max(60).default(6),
  messageTemplates: z.array(botLivestreamMessageTemplateSchema).default([]),
  minimumMessageGapSeconds: z.number().min(15).max(600).default(90),
  prioritizeYoutube: z.boolean().default(true),
  scheduledCadenceMinutes: z.number().min(1).max(120).default(10),
  targetAudience: z
    .array(z.enum(botLivestreamTargetAudiences))
    .default(['audience']),
  transcriptEnabled: z.boolean().default(true),
  transcriptLookbackMinutes: z.number().min(1).max(10).default(3),
});
export const botSettingsSchema = z.object({
  messagesPerMinute: z.number().min(1).max(60).default(5),
  responseDelaySeconds: z.number().min(0).max(300).default(10),
  responses: z.array(botResponseTemplateSchema).default([]),
  triggers: z.array(z.string()).default([]),
});
export const engagementBotSettingsSchema = z.object({
  actions: z
    .array(
      z.enum([
        EngagementAction.LIKE,
        EngagementAction.FOLLOW,
        EngagementAction.RETWEET,
        EngagementAction.BOOKMARK,
      ]),
    )
    .min(1, 'At least one action is required'),
  actionsPerDay: z.number().min(1).max(1000).default(100),
  actionsPerHour: z.number().min(1).max(100).default(10),
  delayBetweenActions: z.number().min(5).max(300).default(30),
  excludeAccounts: z.array(z.string()).default([]),
  maxFollowers: z.number().min(0).optional(),
  minFollowers: z.number().min(0).optional(),
  onlyVerified: z.boolean().default(false),
  targetAccounts: z.array(z.string()).default([]),
  targetHashtags: z.array(z.string()).default([]),
  targetKeywords: z.array(z.string()).default([]),
});
export const monitoringBotSettingsSchema = z.object({
  alertEmail: z.string().email().optional(),
  alertFrequency: z.enum(['instant', 'hourly', 'daily']).default('instant'),
  alertSlackWebhookUrl: z.string().url().optional(),
  alertTypes: z
    .array(
      z.enum([
        MonitoringAlertType.EMAIL,
        MonitoringAlertType.WEBHOOK,
        MonitoringAlertType.IN_APP,
        MonitoringAlertType.SLACK,
      ]),
    )
    .min(1, 'At least one alert type is required'),
  alertWebhookUrl: z.string().url().optional(),
  excludeKeywords: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  keywords: z.array(z.string()).min(1, 'At least one keyword is required'),
  mentionAccounts: z.array(z.string()).default([]),
  minEngagement: z.number().min(0).optional(),
  onlyVerified: z.boolean().default(false),
});
export const publishingBotSettingsSchema = z.object({
  aiPrompt: z.string().optional(),
  appendSignature: z.string().optional(),
  autoHashtags: z.array(z.string()).default([]),
  contentQueueId: z.string().optional(),
  contentSourceType: z
    .enum(['queue', 'template', 'ai_generated'])
    .default('queue'),
  customCronExpression: z.string().optional(),
  daysOfWeek: z.array(z.number().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  frequency: z
    .enum([
      PublishingFrequency.HOURLY,
      PublishingFrequency.DAILY,
      PublishingFrequency.WEEKLY,
      PublishingFrequency.CUSTOM,
    ])
    .default(PublishingFrequency.DAILY),
  maxPostsPerDay: z.number().min(1).max(50).default(5),
  scheduledTimes: z.array(z.string()).default([]),
  templateId: z.string().optional(),
  timezone: z.string().default('UTC'),
});
export const botSchema = z.object({
  category: z
    .enum(['chat', 'comment', 'engagement', 'monitoring', 'publishing'])
    .default('chat'),
  description: z.string().optional(),
  engagementSettings: engagementBotSettingsSchema.optional(),
  label: z.string().min(1, 'Label is required'),
  livestreamSettings: botLivestreamSettingsSchema.optional(),
  monitoringSettings: monitoringBotSettingsSchema.optional(),
  platforms: z
    .array(
      z.enum([BotPlatform.TWITTER, BotPlatform.TWITCH, BotPlatform.YOUTUBE]),
    )
    .min(1, 'At least one platform is required'),
  publishingSettings: publishingBotSettingsSchema.optional(),
  settings: botSettingsSchema.default({
    messagesPerMinute: 5,
    responseDelaySeconds: 10,
    responses: [],
    triggers: [],
  }),
  targets: z.array(botLivestreamTargetSchema).default([]),
});
//# sourceMappingURL=bot.schema.js.map
