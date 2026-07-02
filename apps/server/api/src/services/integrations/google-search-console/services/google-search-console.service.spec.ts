import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
  },
}));

describe('GoogleSearchConsoleService', () => {
  let service: GoogleSearchConsoleService;
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let httpService: vi.Mocked<HttpService>;
  let oauthService: {
    refreshAccessToken: ReturnType<typeof vi.fn>;
  };
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'credential-id',
        refreshToken: 'encrypted-refresh-token',
      }),
      patch: vi.fn().mockResolvedValue({ id: 'credential-id' }),
    };
    oauthService = {
      refreshAccessToken: vi.fn().mockResolvedValue({
        accessToken: 'fresh-access-token',
        expiresIn: 3600,
        refreshToken: 'fresh-refresh-token',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleSearchConsoleService,
        { provide: CredentialsService, useValue: credentialsService },
        { provide: GoogleSearchConsoleOAuthService, useValue: oauthService },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(GoogleSearchConsoleService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists verified Search Console sites', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          siteEntry: [
            {
              permissionLevel: 'siteOwner',
              siteUrl: 'https://genfeed.ai/',
            },
          ],
        },
      }) as never,
    );

    const result = await service.listSites('access-token');

    expect(httpService.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/webmasters/v3/sites',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(result).toEqual([
      {
        _id: 'https://genfeed.ai/',
        permissionLevel: 'siteOwner',
        siteUrl: 'https://genfeed.ai/',
      },
    ]);
  });

  it('pulls Search Analytics rows and maps dimension keys', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          responseAggregationType: 'auto',
          rows: [
            {
              clicks: 12,
              ctr: 0.25,
              impressions: 48,
              keys: ['genfeed ai', 'https://genfeed.ai/', 'usa', 'DESKTOP'],
              position: 3.5,
            },
          ],
        },
      }) as never,
    );

    const result = await service.getSearchAnalytics('access-token', {
      endDate: '2026-06-29',
      siteUrl: 'https://genfeed.ai/',
      startDate: '2026-06-01',
    });

    expect(httpService.post).toHaveBeenCalledWith(
      'https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fgenfeed.ai%2F/searchAnalytics/query',
      expect.objectContaining({
        dimensions: ['query', 'page', 'country', 'device'],
        endDate: '2026-06-29',
        rowLimit: 100,
        startDate: '2026-06-01',
      }),
      expect.any(Object),
    );
    expect(result.rows[0]).toMatchObject({
      clicks: 12,
      country: 'usa',
      device: 'DESKTOP',
      impressions: 48,
      page: 'https://genfeed.ai/',
      position: 3.5,
      query: 'genfeed ai',
    });
  });

  it('refreshes stored credentials through the OAuth service', async () => {
    await service.refreshToken('org-id', 'brand-id');

    expect(credentialsService.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-id',
        organization: 'org-id',
        platform: 'google_search_console',
      }),
    );
    expect(EncryptionUtil.decrypt).toHaveBeenCalledWith(
      'encrypted-refresh-token',
    );
    expect(oauthService.refreshAccessToken).toHaveBeenCalledWith(
      'decrypted:encrypted-refresh-token',
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'credential-id',
      expect.objectContaining({
        accessToken: 'fresh-access-token',
        isConnected: true,
        refreshToken: 'fresh-refresh-token',
      }),
    );
  });

  it('marks the credential disconnected when refresh fails', async () => {
    oauthService.refreshAccessToken.mockRejectedValueOnce(
      new Error('invalid_grant'),
    );

    await expect(service.refreshToken('org-id', 'brand-id')).rejects.toThrow(
      'invalid_grant',
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'credential-id',
      expect.objectContaining({ isConnected: false }),
    );
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('logs and rethrows Search Console API failures', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('quota exceeded')) as never,
    );

    await expect(service.listSites('access-token')).rejects.toThrow(
      'quota exceeded',
    );
    expect(loggerService.error).toHaveBeenCalled();
  });
});
