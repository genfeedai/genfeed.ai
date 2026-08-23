const mockGenerateOAuth2AuthLink = vi.fn();
const mockLoginWithOAuth2 = vi.fn();
const mockRefreshOAuth2Token = vi.fn();

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(function TwitterApiMock() {
    return {
      generateOAuth2AuthLink: mockGenerateOAuth2AuthLink,
      loginWithOAuth2: mockLoginWithOAuth2,
      refreshOAuth2Token: mockRefreshOAuth2Token,
    };
  }),
}));

import { XAdsOAuthService } from '@api/services/integrations/x-ads/services/x-ads-oauth.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';

describe('XAdsOAuthService', () => {
  let configGet: ReturnType<typeof vi.fn>;
  let loggerService: vi.Mocked<Pick<LoggerService, 'error'>>;
  let service: XAdsOAuthService;

  const config: Record<string, string> = {
    X_ADS_CLIENT_ID: 'x-ads-client-id',
    X_ADS_CLIENT_SECRET: 'x-ads-client-secret',
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
    mockGenerateOAuth2AuthLink.mockReturnValue({
      codeVerifier: 'pkce-verifier',
      url: 'https://x.com/i/oauth2/authorize',
    });
  });

  it('requests the canonical X Ads scopes through PKCE', () => {
    const result = service.generateAuthLink('opaque-state');

    expect(TwitterApi).toHaveBeenCalledWith({
      clientId: 'x-ads-client-id',
      clientSecret: 'x-ads-client-secret',
    });
    expect(mockGenerateOAuth2AuthLink).toHaveBeenCalledWith(
      'https://app.genfeed.ai/oauth/x-ads',
      {
        scope: ['ads.read', 'ads.write', 'offline.access'],
        state: 'opaque-state',
      },
    );
    expect(result).toEqual({
      codeVerifier: 'pkce-verifier',
      url: 'https://x.com/i/oauth2/authorize',
    });
  });

  it.each([
    ['X_ADS_CLIENT_ID'],
    ['X_ADS_CLIENT_SECRET'],
    ['X_ADS_REDIRECT_URI'],
  ])('fails closed when %s is missing', (missingKey) => {
    configGet.mockImplementation((key: string) =>
      key === missingKey ? undefined : config[key],
    );

    expect(() => service.generateAuthLink('opaque-state')).toThrow(
      ServiceUnavailableException,
    );
    expect(TwitterApi).not.toHaveBeenCalled();
  });

  it('guards token exchange with the same typed configuration check', async () => {
    configGet.mockReturnValue(undefined);

    await expect(
      service.exchangeAuthCodeForAccessToken('code', 'verifier'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockLoginWithOAuth2).not.toHaveBeenCalled();
  });

  it('exchanges a code and normalizes granted scopes', async () => {
    mockLoginWithOAuth2.mockResolvedValue({
      accessToken: 'access-token',
      expiresIn: 7200,
      refreshToken: 'refresh-token',
      scope: ['ads.read', 'ads.write', 'offline.access'],
    });

    const result = await service.exchangeAuthCodeForAccessToken(
      'code',
      'verifier',
    );

    expect(mockLoginWithOAuth2).toHaveBeenCalledWith({
      code: 'code',
      codeVerifier: 'verifier',
      redirectUri: 'https://app.genfeed.ai/oauth/x-ads',
    });
    expect(result).toEqual({
      accessToken: 'access-token',
      expiresIn: 7200,
      refreshToken: 'refresh-token',
      scope: 'ads.read ads.write offline.access',
    });
  });

  it('guards refresh with the same typed configuration check', async () => {
    configGet.mockReturnValue(undefined);

    await expect(
      service.refreshAccessToken('refresh-token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockRefreshOAuth2Token).not.toHaveBeenCalled();
  });
});
