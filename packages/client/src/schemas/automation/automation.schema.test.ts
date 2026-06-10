import {
  botLivestreamSettingsSchema,
  botLivestreamTargetSchema,
  botResponseTemplateSchema,
  botSchema,
  botSettingsSchema,
  engagementBotSettingsSchema,
  monitoringBotSettingsSchema,
  publishingBotSettingsSchema,
} from '@genfeedai/client/schemas/automation/bot.schema';
import { monitoredAccountSchema } from '@genfeedai/client/schemas/automation/monitored-account.schema';
import { replyBotConfigSchema } from '@genfeedai/client/schemas/automation/reply-bot-config.schema';
import { workflowSchema } from '@genfeedai/client/schemas/automation/workflow.schema';
import {
  AlertFrequency,
  BotCategory,
  BotPlatform,
  ContentSourceType,
  EngagementAction,
  MonitoringAlertType,
  PublishingFrequency,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('automation schemas', () => {
  describe('workflowSchema', () => {
    it('accepts valid workflow', () => {
      expect(
        workflowSchema.safeParse({
          key: 'my-wf',
          label: 'Workflow',
          tasks: ['t1'],
        }).success,
      ).toBe(true);
    });

    it('rejects invalid key', () => {
      expect(
        workflowSchema.safeParse({
          key: 'BAD KEY',
          label: 'L',
          tasks: ['t1'],
        }).success,
      ).toBe(false);
    });

    it('rejects empty tasks', () => {
      expect(
        workflowSchema.safeParse({
          key: 'wf',
          label: 'L',
          tasks: [],
        }).success,
      ).toBe(false);
    });

    it('accepts valid status values', () => {
      for (const status of ['active', 'inactive', 'draft']) {
        expect(
          workflowSchema.safeParse({
            key: 'wf',
            label: 'L',
            status,
            tasks: ['t'],
          }).success,
        ).toBe(true);
      }
    });
  });

  describe('monitoredAccountSchema', () => {
    it('accepts valid account', () => {
      expect(
        monitoredAccountSchema.safeParse({
          platform: ReplyBotPlatform.TWITTER,
          platformUserId: '123',
          username: 'user',
        }).success,
      ).toBe(true);
    });

    it('rejects empty username', () => {
      expect(
        monitoredAccountSchema.safeParse({
          platform: ReplyBotPlatform.TWITTER,
          platformUserId: '123',
          username: '',
        }).success,
      ).toBe(false);
    });

    it('accepts empty string for avatarUrl', () => {
      expect(
        monitoredAccountSchema.safeParse({
          avatarUrl: '',
          platform: ReplyBotPlatform.TWITTER,
          platformUserId: '123',
          username: 'u',
        }).success,
      ).toBe(true);
    });
  });

  describe('botResponseTemplateSchema', () => {
    it('accepts valid template', () => {
      expect(
        botResponseTemplateSchema.safeParse({
          response: 'Hi',
          trigger: 'hello',
        }).success,
      ).toBe(true);
    });

    it('rejects empty response', () => {
      expect(
        botResponseTemplateSchema.safeParse({
          response: '',
          trigger: 'hello',
        }).success,
      ).toBe(false);
    });
  });

  describe('botSettingsSchema', () => {
    it('accepts defaults', () => {
      expect(botSettingsSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('engagementBotSettingsSchema', () => {
    it('accepts valid settings', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
        }).success,
      ).toBe(true);
    });

    it('applies defaults for omitted fields', () => {
      const parsed = engagementBotSettingsSchema.safeParse({
        actions: [EngagementAction.FOLLOW],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.actionsPerDay).toBe(100);
        expect(parsed.data.actionsPerHour).toBe(10);
        expect(parsed.data.delayBetweenActions).toBe(30);
        expect(parsed.data.onlyVerified).toBe(false);
        expect(parsed.data.excludeAccounts).toEqual([]);
        expect(parsed.data.targetAccounts).toEqual([]);
        expect(parsed.data.targetHashtags).toEqual([]);
        expect(parsed.data.targetKeywords).toEqual([]);
      }
    });

    it('rejects empty actions', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [],
        }).success,
      ).toBe(false);
    });

    it('rejects an unknown engagement action', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: ['shout'],
        }).success,
      ).toBe(false);
    });

    it('rejects actionsPerDay outside the supported range', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
          actionsPerDay: 0,
        }).success,
      ).toBe(false);
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
          actionsPerDay: 1001,
        }).success,
      ).toBe(false);
    });

    it('rejects actionsPerHour outside the supported range', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
          actionsPerHour: 0,
        }).success,
      ).toBe(false);
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
          actionsPerHour: 101,
        }).success,
      ).toBe(false);
    });

    it('rejects delayBetweenActions outside the supported range', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
          delayBetweenActions: 4,
        }).success,
      ).toBe(false);
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
          delayBetweenActions: 301,
        }).success,
      ).toBe(false);
    });

    it('rejects a negative follower bound', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [EngagementAction.LIKE],
          minFollowers: -1,
        }).success,
      ).toBe(false);
    });
  });

  describe('monitoringBotSettingsSchema', () => {
    it('accepts valid settings', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: [MonitoringAlertType.EMAIL],
          keywords: ['ai'],
        }).success,
      ).toBe(true);
    });

    it('applies defaults for omitted fields', () => {
      const parsed = monitoringBotSettingsSchema.safeParse({
        alertTypes: [MonitoringAlertType.IN_APP],
        keywords: ['ai'],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.alertFrequency).toBe(AlertFrequency.INSTANT);
        expect(parsed.data.onlyVerified).toBe(false);
        expect(parsed.data.excludeKeywords).toEqual([]);
        expect(parsed.data.hashtags).toEqual([]);
        expect(parsed.data.mentionAccounts).toEqual([]);
      }
    });

    it('rejects empty keywords', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: [MonitoringAlertType.EMAIL],
          keywords: [],
        }).success,
      ).toBe(false);
    });

    it('rejects empty alert types', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: [],
          keywords: ['ai'],
        }).success,
      ).toBe(false);
    });

    it('rejects an unknown alert type', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: ['carrier-pigeon'],
          keywords: ['ai'],
        }).success,
      ).toBe(false);
    });

    it('rejects an unknown alert frequency', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertFrequency: 'whenever',
          alertTypes: [MonitoringAlertType.EMAIL],
          keywords: ['ai'],
        }).success,
      ).toBe(false);
    });

    it('rejects a malformed alert email', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertEmail: 'not-an-email',
          alertTypes: [MonitoringAlertType.EMAIL],
          keywords: ['ai'],
        }).success,
      ).toBe(false);
    });

    it('rejects a malformed alert webhook url', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: [MonitoringAlertType.WEBHOOK],
          alertWebhookUrl: 'not a url',
          keywords: ['ai'],
        }).success,
      ).toBe(false);
    });

    it('rejects a malformed alert slack webhook url', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertSlackWebhookUrl: 'not a url',
          alertTypes: [MonitoringAlertType.SLACK],
          keywords: ['ai'],
        }).success,
      ).toBe(false);
    });

    it('rejects a negative minimum engagement', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: [MonitoringAlertType.EMAIL],
          keywords: ['ai'],
          minEngagement: -1,
        }).success,
      ).toBe(false);
    });
  });

  describe('publishingBotSettingsSchema', () => {
    it('accepts defaults', () => {
      expect(publishingBotSettingsSchema.safeParse({}).success).toBe(true);
    });

    it('applies defaults for omitted fields', () => {
      const parsed = publishingBotSettingsSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.frequency).toBe(PublishingFrequency.DAILY);
        expect(parsed.data.contentSourceType).toBe(ContentSourceType.QUEUE);
        expect(parsed.data.maxPostsPerDay).toBe(5);
        expect(parsed.data.timezone).toBe('UTC');
        expect(parsed.data.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(parsed.data.autoHashtags).toEqual([]);
        expect(parsed.data.scheduledTimes).toEqual([]);
      }
    });

    it('rejects an unknown publishing frequency', () => {
      expect(
        publishingBotSettingsSchema.safeParse({
          frequency: 'fortnightly',
        }).success,
      ).toBe(false);
    });

    it('rejects an unknown content source type', () => {
      expect(
        publishingBotSettingsSchema.safeParse({
          contentSourceType: 'carrier-pigeon',
        }).success,
      ).toBe(false);
    });

    it('rejects maxPostsPerDay outside the supported range', () => {
      expect(
        publishingBotSettingsSchema.safeParse({
          maxPostsPerDay: 0,
        }).success,
      ).toBe(false);
      expect(
        publishingBotSettingsSchema.safeParse({
          maxPostsPerDay: 51,
        }).success,
      ).toBe(false);
    });

    it('rejects a day-of-week outside 0-6', () => {
      expect(
        publishingBotSettingsSchema.safeParse({
          daysOfWeek: [7],
        }).success,
      ).toBe(false);
    });
  });

  describe('botSchema', () => {
    it('accepts valid bot', () => {
      expect(
        botSchema.safeParse({
          label: 'Bot',
          platforms: [BotPlatform.TWITTER],
        }).success,
      ).toBe(true);
    });

    it('rejects empty label', () => {
      expect(
        botSchema.safeParse({
          label: '',
          platforms: [BotPlatform.TWITTER],
        }).success,
      ).toBe(false);
    });

    it('rejects empty platforms', () => {
      expect(
        botSchema.safeParse({
          label: 'Bot',
          platforms: [],
        }).success,
      ).toBe(false);
    });

    it('accepts livestream settings with dual-platform targets', () => {
      expect(
        botSchema.safeParse({
          category: BotCategory.LIVESTREAM_CHAT,
          label: 'Ship Shit Show Bot',
          livestreamSettings: {
            links: [
              {
                id: 'main-link',
                label: 'Main CTA',
                url: 'https://genfeed.ai/live',
              },
            ],
            messageTemplates: [
              {
                enabled: true,
                id: 'context-question',
                text: 'What is your take on {{topic}}?',
                type: 'context_aware_question',
              },
            ],
          },
          platforms: [BotPlatform.YOUTUBE, BotPlatform.TWITCH],
          targets: [
            {
              channelId: 'youtube-channel-id',
              credentialId: '507f1f77bcf86cd799439011',
              liveChatId: 'youtube-live-chat-id',
              platform: BotPlatform.YOUTUBE,
            },
            {
              channelId: 'twitch-channel-id',
              credentialId: '507f1f77bcf86cd799439012',
              platform: BotPlatform.TWITCH,
              senderId: 'twitch-sender-id',
            },
          ],
        }).success,
      ).toBe(true);
    });
  });

  describe('botLivestreamTargetSchema', () => {
    it('accepts optional live chat and credential metadata', () => {
      expect(
        botLivestreamTargetSchema.safeParse({
          channelId: 'UC123456789',
          credentialId: '507f1f77bcf86cd799439011',
          liveChatId: 'Cg0KC1VDeHl6MTIzNDU2',
          platform: BotPlatform.YOUTUBE,
        }).success,
      ).toBe(true);
    });
  });

  describe('botLivestreamSettingsSchema', () => {
    it('accepts defaults and context-aware message templates', () => {
      expect(
        botLivestreamSettingsSchema.safeParse({
          links: [
            {
              id: 'show-notes',
              label: 'Show Notes',
              url: 'https://genfeed.ai/show-notes',
            },
          ],
          messageTemplates: [
            {
              enabled: true,
              id: 'scheduled-link',
              text: 'Link drop: {{link_url}}',
              type: 'scheduled_link_drop',
            },
            {
              enabled: true,
              id: 'context',
              text: 'What are you building around {{topic}}?',
              type: 'context_aware_question',
            },
          ],
          targetAudience: ['hosts', 'audience'],
        }).success,
      ).toBe(true);
    });

    it('rejects cadence values outside the supported limits', () => {
      expect(
        botLivestreamSettingsSchema.safeParse({
          scheduledCadenceMinutes: 0,
        }).success,
      ).toBe(false);
    });
  });

  describe('replyBotConfigSchema', () => {
    it('accepts valid config', () => {
      expect(
        replyBotConfigSchema.safeParse({
          actionType: ReplyBotActionType.REPLY_ONLY,
          name: 'Bot',
          platform: ReplyBotPlatform.TWITTER,
          type: ReplyBotType.REPLY_GUY,
        }).success,
      ).toBe(true);
    });

    it('rejects empty name', () => {
      expect(
        replyBotConfigSchema.safeParse({
          actionType: ReplyBotActionType.REPLY_ONLY,
          name: '',
          platform: ReplyBotPlatform.TWITTER,
          type: ReplyBotType.REPLY_GUY,
        }).success,
      ).toBe(false);
    });

    it('rejects name over 100 chars', () => {
      expect(
        replyBotConfigSchema.safeParse({
          actionType: ReplyBotActionType.REPLY_ONLY,
          name: 'x'.repeat(101),
          platform: ReplyBotPlatform.TWITTER,
          type: ReplyBotType.REPLY_GUY,
        }).success,
      ).toBe(false);
    });
  });
});
