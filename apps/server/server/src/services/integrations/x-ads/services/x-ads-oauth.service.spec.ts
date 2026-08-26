import type { Mocked } from 'vitest';

const mockGenerateAuthLink = vi.fn();
const mockLogin = vi.fn();
const mockAdsClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(function TwitterApiMock() {
    return {
      ads: mockAdsClient,
      generateAuthLink: mockGenerateAuthLink,
      login: mockLogin,
    };
  }),
}));

import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';
import { XAdsOAuthService } from './x-ads-oauth.service';

describe('XAdsOAuthService', () => {
  let configGet: ReturnType<typeof vi.fn>;
  let loggerService: Mocked<Pick<LoggerService, 'error'>>;
  let service: XAdsOAuthService;

  const config: Record<string, string> = {
    X_ADS_API_KEY: 'x-ads-api-key',
    X_ADS_API_SECRET: 'x-ads-api-secret',
    X_ADS_REDIRECT_URI: 'https://app.genfeed.ai/oauth/x-ads',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    configGet = vi.fn((key: string) => config[key]);
    loggerService = { error: vi.fn() };
    service = new XAdsOAuthService(
      { get: configGet } as unknown as ConfigService,
      loggerService as unknown as LoggerService,
    );
    mockGenerateAuthLink.mockResolvedValue({
      oauth_callback_confirmed: 'true',
      oauth_token: 'request-token',
      oauth_token_secret: 'request-token-secret',
      url: 'https://api.x.com/oauth/authorize?oauth_token=request-token',
    });
  });

  it('starts three-legged OAuth 1.0a with a signed request token', async () => {
    const result = await service.generateAuthLink();

    expect(TwitterApi).toHaveBeenCalledWith({
      appKey: 'x-ads-api-key',
      appSecret: 'x-ads-api-secret',
    });
    expect(mockGenerateAuthLink).toHaveBeenCalledWith(
      'https://app.genfeed.ai/oauth/x-ads',
      {
        authAccessType: 'write',
        linkMode: 'authorize',
      },
    );
    expect(result).toEqual({
      oauthToken: 'request-token',
      oauthTokenSecret: 'request-token-secret',
      url: 'https://api.x.com/oauth/authorize?oauth_token=request-token',
    });
  });

  it.each([['X_ADS_API_KEY'], ['X_ADS_API_SECRET'], ['X_ADS_REDIRECT_URI']])(
    'fails closed when %s is missing',
    async (missingKey) => {
      configGet.mockImplementation((key: string) =>
        key === missingKey ? undefined : config[key],
      );

      await expect(service.generateAuthLink()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(TwitterApi).not.toHaveBeenCalled();
    },
  );

  it('fails closed on placeholder application credentials', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'X_ADS_API_KEY' ? 'PLACEHOLDER_NOT_CONFIGURED' : config[key],
    );

    await expect(service.generateAuthLink()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(TwitterApi).not.toHaveBeenCalled();
  });

  it('exchanges the correlated request token and verifier for durable credentials', async () => {
    mockLogin.mockResolvedValue({
      accessToken: 'access-token',
      accessSecret: 'access-token-secret',
      screenName: 'ads-operator',
      userId: 'x-user-1',
    });

    const result = await service.exchangeRequestToken(
      'request-token',
      'request-token-secret',
      'oauth-verifier',
    );

    expect(TwitterApi).toHaveBeenCalledWith({
      accessSecret: 'request-token-secret',
      accessToken: 'request-token',
      appKey: 'x-ads-api-key',
      appSecret: 'x-ads-api-secret',
    });
    expect(mockLogin).toHaveBeenCalledWith('oauth-verifier');
    expect(result).toEqual({
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
      screenName: 'ads-operator',
      userId: 'x-user-1',
    });
  });

  it('builds the Ads client only from X Ads credentials', () => {
    const result = service.createAdsClient({
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
    });

    expect(TwitterApi).toHaveBeenCalledWith({
      accessSecret: 'access-token-secret',
      accessToken: 'access-token',
      appKey: 'x-ads-api-key',
      appSecret: 'x-ads-api-secret',
    });
    expect(result).toBe(mockAdsClient);
  });
});
