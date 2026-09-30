import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Bot: class BaseBot {
    public targets?: unknown[];
    public settings?: unknown;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import {
  BotLivestreamMessageType,
  BotLivestreamTargetAudience,
  BotPlatform,
} from '@genfeedai/contracts';
import { Bot } from '@models/automation/bot.model';

describe('Bot', () => {
  describe('constructor', () => {
    it('should create a bot with default settings', () => {
      const bot = new Bot();
      expect(bot.settings).toBeDefined();
      expect(bot.settings?.messagesPerMinute).toBe(10);
      expect(bot.settings?.responseDelaySeconds).toBe(5);
      expect(bot.settings?.responses).toEqual([]);
      expect(bot.settings?.triggers).toEqual([]);
    });

    it('should normalize settings with custom values', () => {
      const bot = new Bot({
        settings: {
          messagesPerMinute: 20,
          responseDelaySeconds: 3,
        },
      } as never);
      expect(bot.settings?.messagesPerMinute).toBe(20);
      expect(bot.settings?.responseDelaySeconds).toBe(3);
    });

    it('should normalize response templates', () => {
      const bot = new Bot({
        settings: {
          responses: [
            { response: 'Hi!', trigger: 'hello' },
            { trigger: 'bye' },
          ],
        },
      } as never);
      expect(bot.settings?.responses).toHaveLength(2);
      expect(bot.settings?.responses[0]).toEqual({
        response: 'Hi!',
        trigger: 'hello',
      });
      expect(bot.settings?.responses[1]).toEqual({
        response: '',
        trigger: 'bye',
      });
    });

    it('should map targets with defaults', () => {
      const bot = new Bot({
        targets: [
          {
            channelId: 'ch-1',
            channelLabel: 'General',
            channelUrl: 'https://example.com/ch-1',
            isEnabled: true,
            platform: 'discord',
          },
        ],
      } as never);
      expect(bot.targets).toHaveLength(1);
      expect(bot.targets?.[0].isEnabled).toBe(true);
      expect(bot.targets?.[0].channelId).toBe('ch-1');
    });

    it('should preserve explicit isEnabled=false on targets', () => {
      const bot = new Bot({
        targets: [
          {
            channelId: 'ch-2',
            isEnabled: false,
            platform: 'telegram',
          },
        ],
      } as never);
      expect(bot.targets?.[0].isEnabled).toBe(false);
    });

    it('should handle empty targets array', () => {
      const bot = new Bot({ targets: [] } as never);
      expect(bot.targets).toEqual([]);
    });

    it('should handle missing targets', () => {
      const bot = new Bot({} as never);
      expect(bot.targets).toEqual([]);
    });

    it('should copy triggers array', () => {
      const triggers = ['keyword1', 'keyword2'];
      const bot = new Bot({
        settings: { triggers },
      } as never);
      expect(bot.settings?.triggers).toEqual(triggers);
      // Should be a copy, not a reference
      expect(bot.settings?.triggers).not.toBe(triggers);
    });

    it('should default a missing response trigger to an empty string', () => {
      const bot = new Bot({
        settings: {
          responses: [{ response: 'Hi!' }],
        },
      } as never);
      expect(bot.settings?.responses[0]).toEqual({
        response: 'Hi!',
        trigger: '',
      });
    });

    it('should default isEnabled when a target omits it', () => {
      const bot = new Bot({
        targets: [
          {
            channelId: 'ch-3',
            platform: BotPlatform.YOUTUBE,
          },
        ],
      } as never);
      expect(bot.targets?.[0].isEnabled).toBe(true);
    });

    it('should leave livestream settings undefined when omitted', () => {
      const bot = new Bot();
      expect(bot.livestreamSettings).toBeUndefined();
    });

    it('should normalize livestream settings with defaults', () => {
      const bot = new Bot({
        livestreamSettings: {},
      } as never);
      expect(bot.livestreamSettings).toEqual({
        automaticPosting: true,
        links: [],
        manualOverrideTtlMinutes: 15,
        maxAutoPostsPerHour: 6,
        messageTemplates: [],
        minimumMessageGapSeconds: 90,
        prioritizeYoutube: true,
        restreamCredentialId: undefined,
        scheduledCadenceMinutes: 10,
        targetAudience: [BotLivestreamTargetAudience.AUDIENCE],
        transcriptEnabled: true,
        transcriptLookbackMinutes: 3,
        transcriptSource: undefined,
      });
    });

    it('should preserve explicit livestream settings and copy nested arrays', () => {
      const links = [
        { id: 'link-1', label: 'Shop', url: 'https://example.com/shop' },
      ];
      const platforms = [BotPlatform.YOUTUBE];
      const bot = new Bot({
        livestreamSettings: {
          automaticPosting: false,
          links,
          manualOverrideTtlMinutes: 30,
          maxAutoPostsPerHour: 2,
          messageTemplates: [
            {
              enabled: false,
              id: 'tpl-1',
              platforms,
              text: 'Drop',
              type: BotLivestreamMessageType.SCHEDULED_LINK_DROP,
            },
            {
              id: 'tpl-2',
              text: 'Prompt',
              type: BotLivestreamMessageType.SCHEDULED_HOST_PROMPT,
            },
          ],
          minimumMessageGapSeconds: 45,
          prioritizeYoutube: false,
          restreamCredentialId: 'cred-1',
          scheduledCadenceMinutes: 20,
          targetAudience: [BotLivestreamTargetAudience.HOSTS],
          transcriptEnabled: false,
          transcriptLookbackMinutes: 8,
          transcriptSource: 'restream_chat',
        },
      } as never);

      expect(bot.livestreamSettings?.automaticPosting).toBe(false);
      expect(bot.livestreamSettings?.links).toEqual(links);
      expect(bot.livestreamSettings?.links).not.toBe(links);
      expect(bot.livestreamSettings?.manualOverrideTtlMinutes).toBe(30);
      expect(bot.livestreamSettings?.maxAutoPostsPerHour).toBe(2);
      expect(bot.livestreamSettings?.messageTemplates).toHaveLength(2);
      expect(bot.livestreamSettings?.messageTemplates[0]).toEqual({
        enabled: false,
        id: 'tpl-1',
        platforms,
        text: 'Drop',
        type: BotLivestreamMessageType.SCHEDULED_LINK_DROP,
      });
      expect(bot.livestreamSettings?.messageTemplates[1]).toEqual({
        enabled: true,
        id: 'tpl-2',
        platforms: [],
        text: 'Prompt',
        type: BotLivestreamMessageType.SCHEDULED_HOST_PROMPT,
      });
      expect(bot.livestreamSettings?.minimumMessageGapSeconds).toBe(45);
      expect(bot.livestreamSettings?.prioritizeYoutube).toBe(false);
      expect(bot.livestreamSettings?.restreamCredentialId).toBe('cred-1');
      expect(bot.livestreamSettings?.scheduledCadenceMinutes).toBe(20);
      expect(bot.livestreamSettings?.targetAudience).toEqual([
        BotLivestreamTargetAudience.HOSTS,
      ]);
      expect(bot.livestreamSettings?.transcriptEnabled).toBe(false);
      expect(bot.livestreamSettings?.transcriptLookbackMinutes).toBe(8);
      expect(bot.livestreamSettings?.transcriptSource).toBe('restream_chat');
    });
  });
});
