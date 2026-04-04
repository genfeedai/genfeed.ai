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
  BotPlatform,
  EngagementAction,
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

    it('rejects empty actions', () => {
      expect(
        engagementBotSettingsSchema.safeParse({
          actions: [],
        }).success,
      ).toBe(false);
    });
  });

  describe('monitoringBotSettingsSchema', () => {
    it('accepts valid settings', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: ['email'],
          keywords: ['ai'],
        }).success,
      ).toBe(true);
    });

    it('rejects empty keywords', () => {
      expect(
        monitoringBotSettingsSchema.safeParse({
          alertTypes: ['email'],
          keywords: [],
        }).success,
      ).toBe(false);
    });
  });

  describe('publishingBotSettingsSchema', () => {
    it('accepts defaults', () => {
      expect(publishingBotSettingsSchema.safeParse({}).success).toBe(true);
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
