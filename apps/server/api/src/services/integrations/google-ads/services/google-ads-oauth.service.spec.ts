import { ConfigService } from '@api/config/config.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('GoogleAdsOAuthService', () => {
  let service: GoogleAdsOAuthService;
  let configService: vi.Mocked<ConfigService>;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  const CONFIG_VALUES: Record<string, string> = {
    GOOGLE_ADS_CLIENT_ID: 'test-client-id',
    GOOGLE_ADS_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_ADS_REDIRECT_URI: 'https://app.genfeed.ai/callback/google-ads',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAdsOAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => CONFIG_VALUES[key]),
          },
        },
        {
          provide: HttpService,
          useValue: { post: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<GoogleAdsOAuthService>(GoogleAdsOAuthService);
    configService = module.get(ConfigService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should generate a valid Google OAuth URL', () => {
      const url = service.generateAuthUrl('my-state-token');

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain(
        encodeURIComponent('https://www.googleapis.com/auth/adwords'),
      );
      expect(url).toContain('state=my-state-token');
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
    });

    it('should include redirect URI in auth URL', () => {
      const url = service.generateAuthUrl('state-abc');

      expect(url).toContain(
        encodeURIComponent('https://app.genfeed.ai/callback/google-ads'),
      );
    });

    it('should handle missing config gracefully', () => {
      configService.get.mockReturnValue(undefined as never);

      const url = service.generateAuthUrl('state');

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      // Should not throw — just empty params
    });
  });

  describe('exchangeAuthCodeForAccessToken', () => {
    it('should exchange code for tokens', async () => {
      const mockResponse = {
        data: {
          access_token: 'access-token-xyz',
          expires_in: 3600,
          refresh_token: 'refresh-token-xyz',
          token_type: 'Bearer',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse) as never);

      const result = await service.exchangeAuthCodeForAccessToken('auth-code');

      expect(result).toEqual({
        accessToken: 'access-token-xyz',
        expiresIn: 3600,
        refreshToken: 'refresh-token-xyz',
        tokenType: 'Bearer',
      });
    });

    it('should call token endpoint with correct params', async () => {
      const mockResponse = {
        data: {
          access_token: 'at',
          expires_in: 3600,
          refresh_token: 'rt',
          token_type: 'Bearer',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse) as never);

      await service.exchangeAuthCodeForAccessToken('my-code');

      expect(httpService.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          code: 'my-code',
          grant_type: 'authorization_code',
          redirect_uri: 'https://app.genfeed.ai/callback/google-ads',
        }),
      );
    });

    it('should log error and rethrow on HTTP failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Network error')) as never,
      );

      await expect(
        service.exchangeAuthCodeForAccessToken('bad-code'),
      ).rejects.toThrow('Network error');

      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token', async () => {
      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse) as never);

      const result = await service.refreshAccessToken('old-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        expiresIn: 3600,
        refreshToken: 'old-refresh-token', // original refresh token preserved
        tokenType: 'Bearer',
      });
    });

    it('should call token endpoint with refresh_token grant', async () => {
      const mockResponse = {
        data: {
          access_token: 'new-at',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse) as never);

      await service.refreshAccessToken('rt-123');

      expect(httpService.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          grant_type: 'refresh_token',
          refresh_token: 'rt-123',
        }),
      );
    });

    it('should preserve the original refresh token in result', async () => {
      const mockResponse = {
        data: {
          access_token: 'fresh',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      };

      httpService.post.mockReturnValue(of(mockResponse) as never);

      const result = await service.refreshAccessToken('persistent-rt');

      expect(result.refreshToken).toBe('persistent-rt');
    });

    it('should log error and rethrow on refresh failure', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Token expired')) as never,
      );

      await expect(service.refreshAccessToken('invalid-rt')).rejects.toThrow(
        'Token expired',
      );

      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
