import {
  isManualReplyRequired,
  normalizeReplyBotPlatform,
  unsupportedReplyBotPlatformMessage,
} from '@api/services/reply-bot/reply-bot-platform.util';
import { ReplyBotPlatform, ReplyBotType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('reply-bot-platform.util', () => {
  it('normalizes known platform strings and rejects everything else', () => {
    expect(normalizeReplyBotPlatform(' Twitter ')).toBe(
      ReplyBotPlatform.TWITTER,
    );
    expect(normalizeReplyBotPlatform('youtube')).toBe(ReplyBotPlatform.YOUTUBE);
    expect(normalizeReplyBotPlatform('myspace')).toBeUndefined();
    expect(normalizeReplyBotPlatform(12)).toBeUndefined();
  });

  it('names the unsupported platform in the error message', () => {
    expect(unsupportedReplyBotPlatformMessage(' Myspace ')).toBe(
      'Unsupported reply bot platform: Myspace',
    );
    expect(unsupportedReplyBotPlatformMessage('')).toBe(
      'Unsupported reply bot platform: unknown',
    );
    expect(unsupportedReplyBotPlatformMessage(null)).toBe(
      'Unsupported reply bot platform: unknown',
    );
  });

  it('requires a person to post replies from X account monitors only', () => {
    expect(isManualReplyRequired(ReplyBotType.ACCOUNT_MONITOR, 'twitter')).toBe(
      true,
    );
    expect(
      isManualReplyRequired(ReplyBotType.REPLY_GUY, ReplyBotPlatform.TWITTER),
    ).toBe(false);
    expect(
      isManualReplyRequired(ReplyBotType.COMMENT_RESPONDER, 'twitter'),
    ).toBe(false);
    expect(
      isManualReplyRequired(ReplyBotType.ACCOUNT_MONITOR, 'instagram'),
    ).toBe(false);
    expect(isManualReplyRequired(ReplyBotType.ACCOUNT_MONITOR, undefined)).toBe(
      true,
    );
  });
});
