import {
  EngagementAction,
  MonitoringAlertType,
  PublishingFrequency,
} from '@genfeedai/enums';
import { z } from 'zod';
export declare const botLivestreamMessageTypes: readonly [
  'scheduled_link_drop',
  'scheduled_host_prompt',
  'context_aware_question',
];
export declare const botLivestreamTargetAudiences: readonly [
  'hosts',
  'audience',
];
export declare const botResponseTemplateSchema: z.ZodObject<
  {
    response: z.ZodString;
    trigger: z.ZodString;
  },
  z.core.$strip
>;
export declare const botLivestreamTargetSchema: z.ZodObject<
  {
    channelId: z.ZodString;
    channelLabel: z.ZodOptional<z.ZodString>;
    channelUrl: z.ZodOptional<z.ZodString>;
    credentialId: z.ZodOptional<z.ZodString>;
    isEnabled: z.ZodDefault<z.ZodBoolean>;
    liveChatId: z.ZodOptional<z.ZodString>;
    platform: z.ZodEnum<{
      youtube: import('@genfeedai/enums').CredentialPlatform.YOUTUBE;
      twitch: import('@genfeedai/enums').CredentialPlatform.TWITCH;
    }>;
    senderId: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export declare const botLivestreamLinkSchema: z.ZodObject<
  {
    id: z.ZodString;
    label: z.ZodString;
    url: z.ZodString;
  },
  z.core.$strip
>;
export declare const botLivestreamMessageTemplateSchema: z.ZodObject<
  {
    enabled: z.ZodDefault<z.ZodBoolean>;
    id: z.ZodString;
    platforms: z.ZodDefault<
      z.ZodArray<
        z.ZodEnum<{
          youtube: import('@genfeedai/enums').CredentialPlatform.YOUTUBE;
          twitch: import('@genfeedai/enums').CredentialPlatform.TWITCH;
        }>
      >
    >;
    text: z.ZodString;
    type: z.ZodEnum<{
      scheduled_link_drop: 'scheduled_link_drop';
      scheduled_host_prompt: 'scheduled_host_prompt';
      context_aware_question: 'context_aware_question';
    }>;
  },
  z.core.$strip
>;
export declare const botLivestreamSettingsSchema: z.ZodObject<
  {
    automaticPosting: z.ZodDefault<z.ZodBoolean>;
    links: z.ZodDefault<
      z.ZodArray<
        z.ZodObject<
          {
            id: z.ZodString;
            label: z.ZodString;
            url: z.ZodString;
          },
          z.core.$strip
        >
      >
    >;
    manualOverrideTtlMinutes: z.ZodDefault<z.ZodNumber>;
    maxAutoPostsPerHour: z.ZodDefault<z.ZodNumber>;
    messageTemplates: z.ZodDefault<
      z.ZodArray<
        z.ZodObject<
          {
            enabled: z.ZodDefault<z.ZodBoolean>;
            id: z.ZodString;
            platforms: z.ZodDefault<
              z.ZodArray<
                z.ZodEnum<{
                  youtube: import('@genfeedai/enums').CredentialPlatform.YOUTUBE;
                  twitch: import('@genfeedai/enums').CredentialPlatform.TWITCH;
                }>
              >
            >;
            text: z.ZodString;
            type: z.ZodEnum<{
              scheduled_link_drop: 'scheduled_link_drop';
              scheduled_host_prompt: 'scheduled_host_prompt';
              context_aware_question: 'context_aware_question';
            }>;
          },
          z.core.$strip
        >
      >
    >;
    minimumMessageGapSeconds: z.ZodDefault<z.ZodNumber>;
    prioritizeYoutube: z.ZodDefault<z.ZodBoolean>;
    scheduledCadenceMinutes: z.ZodDefault<z.ZodNumber>;
    targetAudience: z.ZodDefault<
      z.ZodArray<
        z.ZodEnum<{
          hosts: 'hosts';
          audience: 'audience';
        }>
      >
    >;
    transcriptEnabled: z.ZodDefault<z.ZodBoolean>;
    transcriptLookbackMinutes: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strip
>;
export declare const botSettingsSchema: z.ZodObject<
  {
    messagesPerMinute: z.ZodDefault<z.ZodNumber>;
    responseDelaySeconds: z.ZodDefault<z.ZodNumber>;
    responses: z.ZodDefault<
      z.ZodArray<
        z.ZodObject<
          {
            response: z.ZodString;
            trigger: z.ZodString;
          },
          z.core.$strip
        >
      >
    >;
    triggers: z.ZodDefault<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export declare const engagementBotSettingsSchema: z.ZodObject<
  {
    actions: z.ZodArray<
      z.ZodEnum<{
        like: EngagementAction.LIKE;
        follow: EngagementAction.FOLLOW;
        retweet: EngagementAction.RETWEET;
        bookmark: EngagementAction.BOOKMARK;
      }>
    >;
    actionsPerDay: z.ZodDefault<z.ZodNumber>;
    actionsPerHour: z.ZodDefault<z.ZodNumber>;
    delayBetweenActions: z.ZodDefault<z.ZodNumber>;
    excludeAccounts: z.ZodDefault<z.ZodArray<z.ZodString>>;
    maxFollowers: z.ZodOptional<z.ZodNumber>;
    minFollowers: z.ZodOptional<z.ZodNumber>;
    onlyVerified: z.ZodDefault<z.ZodBoolean>;
    targetAccounts: z.ZodDefault<z.ZodArray<z.ZodString>>;
    targetHashtags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    targetKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export declare const monitoringBotSettingsSchema: z.ZodObject<
  {
    alertEmail: z.ZodOptional<z.ZodString>;
    alertFrequency: z.ZodDefault<
      z.ZodEnum<{
        instant: 'instant';
        hourly: 'hourly';
        daily: 'daily';
      }>
    >;
    alertSlackWebhookUrl: z.ZodOptional<z.ZodString>;
    alertTypes: z.ZodArray<
      z.ZodEnum<{
        email: MonitoringAlertType.EMAIL;
        webhook: MonitoringAlertType.WEBHOOK;
        in_app: MonitoringAlertType.IN_APP;
        slack: MonitoringAlertType.SLACK;
      }>
    >;
    alertWebhookUrl: z.ZodOptional<z.ZodString>;
    excludeKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hashtags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    keywords: z.ZodArray<z.ZodString>;
    mentionAccounts: z.ZodDefault<z.ZodArray<z.ZodString>>;
    minEngagement: z.ZodOptional<z.ZodNumber>;
    onlyVerified: z.ZodDefault<z.ZodBoolean>;
  },
  z.core.$strip
>;
export declare const publishingBotSettingsSchema: z.ZodObject<
  {
    aiPrompt: z.ZodOptional<z.ZodString>;
    appendSignature: z.ZodOptional<z.ZodString>;
    autoHashtags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    contentQueueId: z.ZodOptional<z.ZodString>;
    contentSourceType: z.ZodDefault<
      z.ZodEnum<{
        queue: 'queue';
        template: 'template';
        ai_generated: 'ai_generated';
      }>
    >;
    customCronExpression: z.ZodOptional<z.ZodString>;
    daysOfWeek: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    frequency: z.ZodDefault<
      z.ZodEnum<{
        hourly: PublishingFrequency.HOURLY;
        daily: PublishingFrequency.DAILY;
        weekly: PublishingFrequency.WEEKLY;
        custom: PublishingFrequency.CUSTOM;
      }>
    >;
    maxPostsPerDay: z.ZodDefault<z.ZodNumber>;
    scheduledTimes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    templateId: z.ZodOptional<z.ZodString>;
    timezone: z.ZodDefault<z.ZodString>;
  },
  z.core.$strip
>;
export declare const botSchema: z.ZodObject<
  {
    category: z.ZodDefault<
      z.ZodEnum<{
        chat: 'chat';
        comment: 'comment';
        engagement: 'engagement';
        monitoring: 'monitoring';
        publishing: 'publishing';
      }>
    >;
    description: z.ZodOptional<z.ZodString>;
    engagementSettings: z.ZodOptional<
      z.ZodObject<
        {
          actions: z.ZodArray<
            z.ZodEnum<{
              like: EngagementAction.LIKE;
              follow: EngagementAction.FOLLOW;
              retweet: EngagementAction.RETWEET;
              bookmark: EngagementAction.BOOKMARK;
            }>
          >;
          actionsPerDay: z.ZodDefault<z.ZodNumber>;
          actionsPerHour: z.ZodDefault<z.ZodNumber>;
          delayBetweenActions: z.ZodDefault<z.ZodNumber>;
          excludeAccounts: z.ZodDefault<z.ZodArray<z.ZodString>>;
          maxFollowers: z.ZodOptional<z.ZodNumber>;
          minFollowers: z.ZodOptional<z.ZodNumber>;
          onlyVerified: z.ZodDefault<z.ZodBoolean>;
          targetAccounts: z.ZodDefault<z.ZodArray<z.ZodString>>;
          targetHashtags: z.ZodDefault<z.ZodArray<z.ZodString>>;
          targetKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
        },
        z.core.$strip
      >
    >;
    label: z.ZodString;
    livestreamSettings: z.ZodOptional<
      z.ZodObject<
        {
          automaticPosting: z.ZodDefault<z.ZodBoolean>;
          links: z.ZodDefault<
            z.ZodArray<
              z.ZodObject<
                {
                  id: z.ZodString;
                  label: z.ZodString;
                  url: z.ZodString;
                },
                z.core.$strip
              >
            >
          >;
          manualOverrideTtlMinutes: z.ZodDefault<z.ZodNumber>;
          maxAutoPostsPerHour: z.ZodDefault<z.ZodNumber>;
          messageTemplates: z.ZodDefault<
            z.ZodArray<
              z.ZodObject<
                {
                  enabled: z.ZodDefault<z.ZodBoolean>;
                  id: z.ZodString;
                  platforms: z.ZodDefault<
                    z.ZodArray<
                      z.ZodEnum<{
                        youtube: import('@genfeedai/enums').CredentialPlatform.YOUTUBE;
                        twitch: import('@genfeedai/enums').CredentialPlatform.TWITCH;
                      }>
                    >
                  >;
                  text: z.ZodString;
                  type: z.ZodEnum<{
                    scheduled_link_drop: 'scheduled_link_drop';
                    scheduled_host_prompt: 'scheduled_host_prompt';
                    context_aware_question: 'context_aware_question';
                  }>;
                },
                z.core.$strip
              >
            >
          >;
          minimumMessageGapSeconds: z.ZodDefault<z.ZodNumber>;
          prioritizeYoutube: z.ZodDefault<z.ZodBoolean>;
          scheduledCadenceMinutes: z.ZodDefault<z.ZodNumber>;
          targetAudience: z.ZodDefault<
            z.ZodArray<
              z.ZodEnum<{
                hosts: 'hosts';
                audience: 'audience';
              }>
            >
          >;
          transcriptEnabled: z.ZodDefault<z.ZodBoolean>;
          transcriptLookbackMinutes: z.ZodDefault<z.ZodNumber>;
        },
        z.core.$strip
      >
    >;
    monitoringSettings: z.ZodOptional<
      z.ZodObject<
        {
          alertEmail: z.ZodOptional<z.ZodString>;
          alertFrequency: z.ZodDefault<
            z.ZodEnum<{
              instant: 'instant';
              hourly: 'hourly';
              daily: 'daily';
            }>
          >;
          alertSlackWebhookUrl: z.ZodOptional<z.ZodString>;
          alertTypes: z.ZodArray<
            z.ZodEnum<{
              email: MonitoringAlertType.EMAIL;
              webhook: MonitoringAlertType.WEBHOOK;
              in_app: MonitoringAlertType.IN_APP;
              slack: MonitoringAlertType.SLACK;
            }>
          >;
          alertWebhookUrl: z.ZodOptional<z.ZodString>;
          excludeKeywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
          hashtags: z.ZodDefault<z.ZodArray<z.ZodString>>;
          keywords: z.ZodArray<z.ZodString>;
          mentionAccounts: z.ZodDefault<z.ZodArray<z.ZodString>>;
          minEngagement: z.ZodOptional<z.ZodNumber>;
          onlyVerified: z.ZodDefault<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    platforms: z.ZodArray<
      z.ZodEnum<{
        youtube: import('@genfeedai/enums').CredentialPlatform.YOUTUBE;
        twitter: import('@genfeedai/enums').CredentialPlatform.TWITTER;
        twitch: import('@genfeedai/enums').CredentialPlatform.TWITCH;
      }>
    >;
    publishingSettings: z.ZodOptional<
      z.ZodObject<
        {
          aiPrompt: z.ZodOptional<z.ZodString>;
          appendSignature: z.ZodOptional<z.ZodString>;
          autoHashtags: z.ZodDefault<z.ZodArray<z.ZodString>>;
          contentQueueId: z.ZodOptional<z.ZodString>;
          contentSourceType: z.ZodDefault<
            z.ZodEnum<{
              queue: 'queue';
              template: 'template';
              ai_generated: 'ai_generated';
            }>
          >;
          customCronExpression: z.ZodOptional<z.ZodString>;
          daysOfWeek: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
          frequency: z.ZodDefault<
            z.ZodEnum<{
              hourly: PublishingFrequency.HOURLY;
              daily: PublishingFrequency.DAILY;
              weekly: PublishingFrequency.WEEKLY;
              custom: PublishingFrequency.CUSTOM;
            }>
          >;
          maxPostsPerDay: z.ZodDefault<z.ZodNumber>;
          scheduledTimes: z.ZodDefault<z.ZodArray<z.ZodString>>;
          templateId: z.ZodOptional<z.ZodString>;
          timezone: z.ZodDefault<z.ZodString>;
        },
        z.core.$strip
      >
    >;
    settings: z.ZodDefault<
      z.ZodObject<
        {
          messagesPerMinute: z.ZodDefault<z.ZodNumber>;
          responseDelaySeconds: z.ZodDefault<z.ZodNumber>;
          responses: z.ZodDefault<
            z.ZodArray<
              z.ZodObject<
                {
                  response: z.ZodString;
                  trigger: z.ZodString;
                },
                z.core.$strip
              >
            >
          >;
          triggers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        },
        z.core.$strip
      >
    >;
    targets: z.ZodDefault<
      z.ZodArray<
        z.ZodObject<
          {
            channelId: z.ZodString;
            channelLabel: z.ZodOptional<z.ZodString>;
            channelUrl: z.ZodOptional<z.ZodString>;
            credentialId: z.ZodOptional<z.ZodString>;
            isEnabled: z.ZodDefault<z.ZodBoolean>;
            liveChatId: z.ZodOptional<z.ZodString>;
            platform: z.ZodEnum<{
              youtube: import('@genfeedai/enums').CredentialPlatform.YOUTUBE;
              twitch: import('@genfeedai/enums').CredentialPlatform.TWITCH;
            }>;
            senderId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
  },
  z.core.$strip
>;
export type BotSchema = z.infer<typeof botSchema>;
export type BotSettingsSchema = z.infer<typeof botSettingsSchema>;
export type BotResponseTemplateSchema = z.infer<
  typeof botResponseTemplateSchema
>;
export type BotLivestreamTargetSchema = z.infer<
  typeof botLivestreamTargetSchema
>;
export type BotLivestreamLinkSchema = z.infer<typeof botLivestreamLinkSchema>;
export type BotLivestreamMessageTemplateSchema = z.infer<
  typeof botLivestreamMessageTemplateSchema
>;
export type BotLivestreamSettingsSchema = z.infer<
  typeof botLivestreamSettingsSchema
>;
export type BotLivestreamMessageTypeSchema =
  (typeof botLivestreamMessageTypes)[number];
export type BotLivestreamTargetAudienceSchema =
  (typeof botLivestreamTargetAudiences)[number];
export type EngagementBotSettingsSchema = z.infer<
  typeof engagementBotSettingsSchema
>;
export type MonitoringBotSettingsSchema = z.infer<
  typeof monitoringBotSettingsSchema
>;
export type PublishingBotSettingsSchema = z.infer<
  typeof publishingBotSettingsSchema
>;
//# sourceMappingURL=bot.schema.d.ts.map
