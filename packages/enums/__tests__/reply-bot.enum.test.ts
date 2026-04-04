import { describe, expect, it } from 'vitest';
import {
  BotActivitySkipReason,
  BotActivityStatus,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
  SocialContentType,
} from '../src/reply-bot.enum';

describe('reply-bot.enum', () => {
  describe('ReplyBotType', () => {
    it('should have 3 members', () => {
      expect(Object.values(ReplyBotType)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ReplyBotType.REPLY_GUY).toBe('reply_guy');
      expect(ReplyBotType.ACCOUNT_MONITOR).toBe('account_monitor');
      expect(ReplyBotType.COMMENT_RESPONDER).toBe('comment_responder');
    });
  });

  describe('ReplyBotPlatform', () => {
    it('should have 5 members', () => {
      expect(Object.values(ReplyBotPlatform)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ReplyBotPlatform.TWITTER).toBe('twitter');
      expect(ReplyBotPlatform.INSTAGRAM).toBe('instagram');
      expect(ReplyBotPlatform.TIKTOK).toBe('tiktok');
      expect(ReplyBotPlatform.YOUTUBE).toBe('youtube');
      expect(ReplyBotPlatform.REDDIT).toBe('reddit');
    });
  });

  describe('SocialContentType', () => {
    it('should have 6 members', () => {
      expect(Object.values(SocialContentType)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(SocialContentType.TWEET).toBe('tweet');
      expect(SocialContentType.POST).toBe('post');
      expect(SocialContentType.REEL).toBe('reel');
      expect(SocialContentType.VIDEO).toBe('video');
      expect(SocialContentType.REDDIT_POST).toBe('reddit_post');
      expect(SocialContentType.COMMENT).toBe('comment');
    });
  });

  describe('ReplyBotActionType', () => {
    it('should have 3 members', () => {
      expect(Object.values(ReplyBotActionType)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ReplyBotActionType.REPLY_ONLY).toBe('reply_only');
      expect(ReplyBotActionType.DM_ONLY).toBe('dm_only');
      expect(ReplyBotActionType.REPLY_AND_DM).toBe('reply_and_dm');
    });
  });

  describe('BotActivityStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(BotActivityStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(BotActivityStatus.PENDING).toBe('pending');
      expect(BotActivityStatus.PROCESSING).toBe('processing');
      expect(BotActivityStatus.COMPLETED).toBe('completed');
      expect(BotActivityStatus.FAILED).toBe('failed');
      expect(BotActivityStatus.SKIPPED).toBe('skipped');
    });
  });

  describe('BotActivitySkipReason', () => {
    it('should have 5 members', () => {
      expect(Object.values(BotActivitySkipReason)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(BotActivitySkipReason.RATE_LIMITED).toBe('rate_limited');
      expect(BotActivitySkipReason.FILTERED_OUT).toBe('filtered_out');
      expect(BotActivitySkipReason.ALREADY_PROCESSED).toBe('already_processed');
      expect(BotActivitySkipReason.BOT_PAUSED).toBe('bot_paused');
      expect(BotActivitySkipReason.OUTSIDE_SCHEDULE).toBe('outside_schedule');
    });
  });
});
