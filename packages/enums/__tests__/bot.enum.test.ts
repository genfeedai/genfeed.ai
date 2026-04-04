import { describe, expect, it } from 'vitest';
import {
  BotCategory,
  BotStatus,
  EngagementAction,
  MonitoringAlertType,
  PublishingFrequency,
} from '../src/bot.enum';

describe('bot.enum', () => {
  describe('BotCategory', () => {
    it('should have 5 members', () => {
      expect(Object.values(BotCategory)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(BotCategory.CHAT).toBe('chat');
      expect(BotCategory.COMMENT).toBe('comment');
      expect(BotCategory.ENGAGEMENT).toBe('engagement');
      expect(BotCategory.MONITORING).toBe('monitoring');
      expect(BotCategory.PUBLISHING).toBe('publishing');
    });
  });

  describe('BotStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(BotStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(BotStatus.ACTIVE).toBe('active');
      expect(BotStatus.PAUSED).toBe('paused');
      expect(BotStatus.INACTIVE).toBe('inactive');
    });
  });

  describe('EngagementAction', () => {
    it('should have 4 members', () => {
      expect(Object.values(EngagementAction)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(EngagementAction.LIKE).toBe('like');
      expect(EngagementAction.FOLLOW).toBe('follow');
      expect(EngagementAction.RETWEET).toBe('retweet');
      expect(EngagementAction.BOOKMARK).toBe('bookmark');
    });
  });

  describe('MonitoringAlertType', () => {
    it('should have 4 members', () => {
      expect(Object.values(MonitoringAlertType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(MonitoringAlertType.EMAIL).toBe('email');
      expect(MonitoringAlertType.WEBHOOK).toBe('webhook');
      expect(MonitoringAlertType.IN_APP).toBe('in_app');
      expect(MonitoringAlertType.SLACK).toBe('slack');
    });
  });

  describe('PublishingFrequency', () => {
    it('should have 4 members', () => {
      expect(Object.values(PublishingFrequency)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(PublishingFrequency.HOURLY).toBe('hourly');
      expect(PublishingFrequency.DAILY).toBe('daily');
      expect(PublishingFrequency.WEEKLY).toBe('weekly');
      expect(PublishingFrequency.CUSTOM).toBe('custom');
    });
  });
});
