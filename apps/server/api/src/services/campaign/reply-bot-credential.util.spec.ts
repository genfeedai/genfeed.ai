import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { describe, expect, it } from 'vitest';

describe('toReplyBotCredentialData', () => {
  it('maps full credential data into reply-bot credential data', () => {
    const result = toReplyBotCredentialData({
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
      externalId: 'external-id',
      platform: 'twitter',
      refreshToken: 'refresh-token',
      username: 'bot-user',
    });

    expect(result).toEqual({
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
      externalId: 'external-id',
      platform: 'twitter',
      refreshToken: 'refresh-token',
      username: 'bot-user',
    });
  });

  it('returns null when accessToken is not a string', () => {
    expect(toReplyBotCredentialData({})).toBeNull();
    expect(toReplyBotCredentialData({ accessToken: null })).toBeNull();
    expect(toReplyBotCredentialData({ accessToken: 123 })).toBeNull();
  });

  it('preserves optional fields as undefined when they are not strings', () => {
    expect(
      toReplyBotCredentialData({
        accessToken: 'access-token',
        accessTokenSecret: null,
        externalId: 123,
        platform: null,
        refreshToken: false,
        username: undefined,
      }),
    ).toEqual({
      accessToken: 'access-token',
      accessTokenSecret: undefined,
      externalId: undefined,
      platform: undefined,
      refreshToken: undefined,
      username: undefined,
    });
  });

  it('keeps legacy platform string coercion', () => {
    expect(
      toReplyBotCredentialData({
        accessToken: 'access-token',
        platform: 123,
      })?.platform,
    ).toBe('123');
  });
});
