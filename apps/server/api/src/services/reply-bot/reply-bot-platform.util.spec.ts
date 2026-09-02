import {
  normalizeReplyBotPlatform,
  unsupportedReplyBotPlatformMessage,
} from '@api/services/reply-bot/reply-bot-platform.util';
import { ReplyBotPlatform } from '@genfeedai/enums';
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
});
