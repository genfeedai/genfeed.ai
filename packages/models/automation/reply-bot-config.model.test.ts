import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  ReplyBotConfig: class BaseReplyBotConfig {
    public rateLimits?: unknown;
    public monitoredAccounts?: unknown[];
    public totalRepliesSent?: number;
    public totalDmsSent?: number;
    public totalSkipped?: number;
    public totalFailed?: number;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ReplyBotConfig } from '@models/automation/reply-bot-config.model';

describe('ReplyBotConfig', () => {
  describe('constructor', () => {
    it('should create with default rate limits', () => {
      const config = new ReplyBotConfig();
      expect(config.rateLimits).toBeDefined();
      const limits = config.rateLimits as unknown as Record<string, unknown>;
      expect(limits.maxRepliesPerHour).toBe(10);
      expect(limits.maxRepliesPerDay).toBe(50);
      expect(limits.maxRepliesPerAccountPerDay).toBe(5);
      expect(limits.currentDayCount).toBe(0);
      expect(limits.currentHourCount).toBe(0);
    });

    it('should normalize custom rate limits', () => {
      const config = new ReplyBotConfig({
        rateLimits: {
          maxRepliesPerDay: 100,
          maxRepliesPerHour: 25,
        },
      } as never);
      const limits = config.rateLimits as unknown as Record<string, unknown>;
      expect(limits.maxRepliesPerDay).toBe(100);
      expect(limits.maxRepliesPerHour).toBe(25);
      expect(limits.maxRepliesPerAccountPerDay).toBe(5); // default
    });

    it('should preserve reset timestamps', () => {
      const dayReset = '2024-01-01T00:00:00Z';
      const hourReset = '2024-01-01T01:00:00Z';
      const config = new ReplyBotConfig({
        rateLimits: {
          dayResetAt: dayReset,
          hourResetAt: hourReset,
        },
      } as never);
      const limits = config.rateLimits as unknown as Record<string, unknown>;
      expect(limits.dayResetAt).toBe(dayReset);
      expect(limits.hourResetAt).toBe(hourReset);
    });

    it('should default counters to 0', () => {
      const config = new ReplyBotConfig();
      expect(config.totalRepliesSent).toBe(0);
      expect(config.totalDmsSent).toBe(0);
      expect(config.totalSkipped).toBe(0);
      expect(config.totalFailed).toBe(0);
    });

    it('should accept custom counter values', () => {
      const config = new ReplyBotConfig({
        totalDmsSent: 5,
        totalFailed: 2,
        totalRepliesSent: 10,
        totalSkipped: 3,
      } as never);
      expect(config.totalRepliesSent).toBe(10);
      expect(config.totalDmsSent).toBe(5);
      expect(config.totalSkipped).toBe(3);
      expect(config.totalFailed).toBe(2);
    });

    it('should copy monitored accounts array', () => {
      const accounts = ['acc-1', 'acc-2'];
      const config = new ReplyBotConfig({
        monitoredAccounts: accounts,
      } as never);
      expect(config.monitoredAccounts).toEqual(accounts);
      expect(config.monitoredAccounts).not.toBe(accounts);
    });

    it('should default to empty monitored accounts', () => {
      const config = new ReplyBotConfig();
      expect(config.monitoredAccounts).toEqual([]);
    });
  });
});
