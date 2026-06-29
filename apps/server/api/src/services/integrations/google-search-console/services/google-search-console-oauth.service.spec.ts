import { ConfigService } from '@api/config/config.service';
import { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('GoogleSearchConsoleOAuthService', () => {
  let service: GoogleSearchConsoleOAuthService;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  const configValues: Record<string, string> = {
    GOOGLE_SEARCH_CONSOLE_CLIENT_ID: 'gsc-client-id',
    GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET: 'gsc-client-secret',
    GOOGLE_SEARCH_CONSOLE_REDIRECT_URI:
      'https://app.genfeed.ai/oauth/google-search-console',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSearchConsoleOAuthService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn((key: string) => configValues[key]) },
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

    service = module.get(GoogleSearchConsoleOAuthService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates a Google OAuth URL with Search Console readonly scope', () => {
    const url = service.generateAuthUrl('state-token');

    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=gsc-client-id');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(url).toContain('state=state-token');
    expect(url).toContain(
      encodeURIComponent('https://www.googleapis.com/auth/webmasters.readonly'),
    );
  });

  it('exchanges an authorization code for OAuth tokens', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          access_token: 'access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
        },
      }) as never,
    );

    const result = await service.exchangeAuthCodeForAccessToken('code-123');

    expect(httpService.post).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        client_id: 'gsc-client-id',
        client_secret: 'gsc-client-secret',
        code: 'code-123',
        grant_type: 'authorization_code',
        redirect_uri: 'https://app.genfeed.ai/oauth/google-search-console',
      }),
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      expiresIn: 3600,
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
    });
  });

  it('refreshes an access token using the refresh token grant', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        },
      }) as never,
    );

    const result = await service.refreshAccessToken('refresh-token');

    expect(httpService.post).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
      }),
    );
    expect(result).toEqual({
      accessToken: 'new-access-token',
      expiresIn: 3600,
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
    });
  });

  it('logs and rethrows token exchange failures', async () => {
    httpService.post.mockReturnValue(
      throwError(() => new Error('token failed')) as never,
    );

    await expect(
      service.exchangeAuthCodeForAccessToken('bad-code'),
    ).rejects.toThrow('token failed');
    expect(loggerService.error).toHaveBeenCalled();
  });
});
