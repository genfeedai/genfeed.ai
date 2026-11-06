/**
 * twitter-api-v2 replaced by a client that records each configuration it was
 * built with, each request-token call and each login verifier it was handed.
 */
const twitter = vi.hoisted(() => ({
  adsClient: {
    get: () => undefined,
    post: () => undefined,
    put: () => undefined,
  },
  authLinks: [] as { callback: string; options: unknown }[],
  configs: [] as Record<string, string>[],
  verifiers: [] as string[],
}));

vi.mock('twitter-api-v2', () => ({
  TwitterApi: function TwitterApiFake(config: Record<string, string>) {
    twitter.configs.push(config);
    return {
      ads: twitter.adsClient,
      generateAuthLink: async (callback: string, options: unknown) => {
        twitter.authLinks.push({ callback, options });
        return {
          oauth_callback_confirmed: 'true',
          oauth_token: 'request-token',
          oauth_token_secret: 'request-token-secret',
          url: 'https://api.x.com/oauth/authorize?oauth_token=request-token',
        };
      },
      login: async (verifier: string) => {
        twitter.verifiers.push(verifier);
        return {
          accessSecret: 'access-token-secret',
          accessToken: 'access-token',
          screenName: 'ads-operator',
          userId: 'x-user-1',
        };
      },
    };
  },
}));

import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { XAdsOAuthService } from './x-ads-oauth.service';

const config: Record<string, string> = {
  X_ADS_API_KEY: 'x-ads-api-key',
  X_ADS_API_SECRET: 'x-ads-api-secret',
  X_ADS_REDIRECT_URI: 'https://app.genfeed.ai/oauth/x-ads',
};

function buildService(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    ...config,
    ...overrides,
  };
  return new XAdsOAuthService(
    { get: (key: string) => values[key] } as unknown as ConfigService,
    { error: () => undefined } as unknown as LoggerService,
  );
}

describe('XAdsOAuthService', () => {
  beforeEach(() => {
    twitter.authLinks.length = 0;
    twitter.configs.length = 0;
    twitter.verifiers.length = 0;
  });

  it('starts three-legged OAuth 1.0a with a signed request token', async () => {
    await expect(buildService().generateAuthLink()).resolves.toEqual({
      oauthToken: 'request-token',
      oauthTokenSecret: 'request-token-secret',
      url: 'https://api.x.com/oauth/authorize?oauth_token=request-token',
    });
    expect(twitter.configs).toEqual([
      { appKey: 'x-ads-api-key', appSecret: 'x-ads-api-secret' },
    ]);
    expect(twitter.authLinks).toEqual([
      {
        callback: 'https://app.genfeed.ai/oauth/x-ads',
        options: { authAccessType: 'write', linkMode: 'authorize' },
      },
    ]);
  });

  it.each([
    ['X_ADS_API_KEY', undefined],
    ['X_ADS_API_SECRET', undefined],
    ['X_ADS_REDIRECT_URI', undefined],
    ['X_ADS_API_KEY', 'PLACEHOLDER_NOT_CONFIGURED'],
  ])('fails closed when %s is %s', async (key, value) => {
    await expect(
      buildService({ [key]: value }).generateAuthLink(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(twitter.configs).toEqual([]);
  });

  it('exchanges the correlated request token and verifier for durable credentials', async () => {
    const result = await buildService().exchangeRequestToken(
      'request-token',
      'request-token-secret',
      'oauth-verifier',
    );

    expect(result).toEqual({
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
      screenName: 'ads-operator',
      userId: 'x-user-1',
    });
    expect(twitter.configs).toEqual([
      {
        accessSecret: 'request-token-secret',
        accessToken: 'request-token',
        appKey: 'x-ads-api-key',
        appSecret: 'x-ads-api-secret',
      },
    ]);
    expect(twitter.verifiers).toEqual(['oauth-verifier']);
  });

  it('builds the Ads client only from X Ads credentials', () => {
    const result = buildService().createAdsClient({
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
    });

    expect(result).toBe(twitter.adsClient);
    expect(twitter.configs).toEqual([
      {
        accessSecret: 'access-token-secret',
        accessToken: 'access-token',
        appKey: 'x-ads-api-key',
        appSecret: 'x-ads-api-secret',
      },
    ]);
  });
});
