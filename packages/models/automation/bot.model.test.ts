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
  });
});
