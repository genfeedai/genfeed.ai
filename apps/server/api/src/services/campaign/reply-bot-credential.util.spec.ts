import {
  readReplyBotCredentialId,
  toReplyBotCredentialData,
} from '@api/services/campaign/reply-bot-credential.util';
import { ReplyBotPlatform } from '@genfeedai/enums';
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
      brandId: undefined,
      externalId: 'external-id',
      organizationId: undefined,
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
      brandId: undefined,
      externalId: undefined,
      organizationId: undefined,
      platform: undefined,
      refreshToken: undefined,
      username: undefined,
    });
  });

  it('uses externalHandle when username is missing', () => {
    expect(
      toReplyBotCredentialData({
        accessToken: 'access-token',
        externalHandle: '@handle',
      })?.username,
    ).toBe('@handle');
  });

  it('applies org/brand/platform options at the decrypt boundary', () => {
    expect(
      toReplyBotCredentialData(
        {
          accessToken: 'access-token',
          platform: 'TWITTER',
        },
        {
          brandId: 'brand-1',
          organizationId: 'org-1',
          platform: ReplyBotPlatform.YOUTUBE,
        },
      ),
    ).toEqual(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'youtube',
      }),
    );
  });

  it('maps Prisma SCREAMING platform labels to domain lowercase', () => {
    expect(
      toReplyBotCredentialData({
        accessToken: 'access-token',
        platform: 'YOUTUBE',
      })?.platform,
    ).toBe('youtube');
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

describe('readReplyBotCredentialId', () => {
  it('prefers root credentialId', () => {
    expect(
      readReplyBotCredentialId({
        config: { credentialId: 'nested' },
        credentialId: 'root',
      }),
    ).toBe('root');
  });

  it('falls back to nested config.credentialId', () => {
    expect(
      readReplyBotCredentialId({
        config: { credentialId: 'nested' },
      }),
    ).toBe('nested');
  });
});
