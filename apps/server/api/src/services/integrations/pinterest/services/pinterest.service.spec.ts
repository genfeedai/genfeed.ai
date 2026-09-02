import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { PinterestService } from './pinterest.service';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
    encrypt: vi.fn((value: string) => value),
  },
}));

describe('PinterestService', () => {
  let service: PinterestService;
  const httpServiceMock = {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as HttpService;
  const credentialsServiceMock = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findOne: vi.fn(),
    mergeWarmupSignals: vi.fn(),
    patch: vi.fn(),
    // Multi-account resolution routes through `resolveBrandAccount`; the double
    // answers with whatever `findOne` is primed to return so the existing
    // single-account cases keep describing one connected account.
    resolveBrandAccount: vi.fn(),
  } satisfies ServerCredentialStore;
  credentialsServiceMock.resolveBrandAccount.mockImplementation(
    (options: { credentialId?: string | null }) =>
      (credentialsServiceMock.findOne as Mock)(options),
  );

  beforeEach(async () => {
    process.env.PINTEREST_CLIENT_ID = 'client';
    process.env.PINTEREST_CLIENT_SECRET = 'secret';
    process.env.PINTEREST_REDIRECT_URI = 'https://example.com/callback';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PinterestService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                PINTEREST_CLIENT_ID: 'client',
                PINTEREST_CLIENT_SECRET: 'secret',
                PINTEREST_REDIRECT_URI: 'https://example.com/callback',
              };
              return config[key];
            }),
          },
        },
        {
          provide: SERVER_TOKENS.credentials,
          useValue: credentialsServiceMock,
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: HttpService, useValue: httpServiceMock },
      ],
    }).compile();

    service = module.get<PinterestService>(PinterestService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generateAuthUrl builds url', () => {
    const url = service.generateAuthUrl('state');
    expect(url).toContain('client_id=client');
    expect(url).toContain('state=state');
  });

  it('createPin posts to API', async () => {
    (httpServiceMock.post as Mock).mockReturnValue(of({ data: { id: '1' } }));

    const id = await service.createPin(
      'token',
      'board',
      'https://image',
      'title',
      'desc',
    );

    expect(httpServiceMock.post).toHaveBeenCalledWith(
      'https://api.pinterest.com/v5/pins',
      expect.objectContaining({ board_id: 'board', title: 'title' }),
      { headers: { Authorization: 'Bearer token' } },
    );
    expect(id).toBe('1');
  });

  it('exchangeCodeForToken exchanges code', async () => {
    (httpServiceMock.post as Mock).mockReturnValue(
      of({ data: { access_token: 'a', refresh_token: 'r' } }),
    );

    const tokens = await service.exchangeCodeForToken('code');

    expect(httpServiceMock.post).toHaveBeenCalled();
    expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('searchPins returns items', async () => {
    (httpServiceMock.get as Mock).mockReturnValue(
      of({ data: { items: [{ id: 1 }] } }),
    );

    const res = await service.searchPins('token', 'q');

    expect(httpServiceMock.get).toHaveBeenCalledWith(
      'https://api.pinterest.com/v5/search/pins',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
        params: { query: 'q' },
      }),
    );
    expect(res).toEqual([{ id: 1 }]);
  });

  it('getPinAnalytics requests analytics', async () => {
    (httpServiceMock.get as Mock).mockReturnValue(
      of({ data: { metrics: {} } }),
    );

    const data = await service.getPinAnalytics('token', 'pin');

    expect(httpServiceMock.get).toHaveBeenCalledWith(
      'https://api.pinterest.com/v5/pins/pin/analytics',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      }),
    );
    expect(data).toEqual({ metrics: {} });
  });

  describe('getTrends', () => {
    it('reads v5 growing keywords for a connected business credential', async () => {
      (credentialsServiceMock.findOne as Mock).mockResolvedValue({
        accessToken: 'business-token',
      });
      (httpServiceMock.get as Mock).mockReturnValue(
        of({
          data: {
            trends: [
              {
                keyword: 'summer nails',
                pct_growth_mom: 100,
                pct_growth_wow: 30,
                pct_growth_yoy: 10,
                time_series: { '2026-08-17': 71, '2026-08-24': 87 },
              },
            ],
          },
        }),
      );

      await expect(
        service.getTrends('org', 'brand', 'us', 10),
      ).resolves.toEqual([
        {
          keyword: 'summer nails',
          monthlyGrowth: 100,
          timeSeries: { '2026-08-17': 71, '2026-08-24': 87 },
          weeklyGrowth: 30,
          yearlyGrowth: 10,
        },
      ]);
      expect(credentialsServiceMock.resolveBrandAccount).toHaveBeenCalledWith({
        brandId: 'brand',
        organizationId: 'org',
        platform: 'pinterest',
      });
      expect(httpServiceMock.get).toHaveBeenCalledWith(
        'https://api.pinterest.com/v5/trends/keywords/US/top/growing',
        {
          headers: { Authorization: 'Bearer business-token' },
          params: { limit: 10 },
        },
      );
    });

    it('does not call the native endpoint without a connected credential', async () => {
      (credentialsServiceMock.findOne as Mock).mockResolvedValue(null);

      await expect(service.getTrends('org', 'brand')).resolves.toEqual([]);

      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('does not call the native endpoint for an unscoped request', async () => {
      await expect(service.getTrends()).resolves.toEqual([]);

      expect(credentialsServiceMock.resolveBrandAccount).not.toHaveBeenCalled();
      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('propagates endpoint entitlement errors for orchestration fallback', async () => {
      (credentialsServiceMock.findOne as Mock).mockResolvedValue({
        accessToken: 'business-token',
      });
      (httpServiceMock.get as Mock).mockReturnValue(
        throwError(() => new Error('Pinterest trends not entitled')),
      );

      await expect(service.getTrends('org', 'brand')).rejects.toThrow(
        'Pinterest trends not entitled',
      );
    });
  });

  describe('getMediaAnalytics', () => {
    it('maps Pinterest provider metrics using the stored credential', async () => {
      (credentialsServiceMock.findOne as Mock).mockResolvedValue({
        accessToken: 'stored-token',
      });
      (httpServiceMock.get as Mock).mockReturnValue(
        of({
          data: {
            metrics: {
              IMPRESSION: { value: 120 },
              OUTBOUND_CLICK: { value: 4 },
              PIN_CLICK: { value: 6 },
              SAVE: { value: '9' },
            },
          },
        }),
      );

      const result = await service.getMediaAnalytics('org', 'brand', 'pin-1');

      // Analytics reads act as the brand's account, resolved through the
      // multi-account resolver rather than a direct brand/platform lookup.
      expect(credentialsServiceMock.resolveBrandAccount).toHaveBeenCalledWith({
        brandId: 'brand',
        credentialId: undefined,
        organizationId: 'org',
        platform: 'pinterest',
      });
      expect(httpServiceMock.get).toHaveBeenCalledWith(
        'https://api.pinterest.com/v5/pins/pin-1/analytics',
        expect.objectContaining({
          headers: { Authorization: 'Bearer stored-token' },
        }),
      );
      expect(result).toEqual({
        clicks: 10,
        comments: 0,
        impressions: 120,
        likes: 0,
        saves: 9,
        views: 120,
      });
    });

    it('throws instead of returning zeroed mock metrics when credentials are missing', async () => {
      (credentialsServiceMock.findOne as Mock).mockResolvedValue(null);

      await expect(
        service.getMediaAnalytics('org', 'brand', 'pin-1'),
      ).rejects.toThrow('Pinterest credential not found');

      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('finds metrics nested under a wrapper object via breadth-first traversal', async () => {
      (credentialsServiceMock.findOne as Mock).mockResolvedValue({
        accessToken: 'stored-token',
      });
      (httpServiceMock.get as Mock).mockReturnValue(
        of({
          data: {
            metrics: {
              daily: {
                IMPRESSION: { value: 42 },
                OUTBOUND_CLICK: { value: 1 },
                PIN_CLICK: { value: 2 },
                SAVE: { value: 3 },
              },
            },
          },
        }),
      );

      const result = await service.getMediaAnalytics('org', 'brand', 'pin-1');

      expect(result).toEqual({
        clicks: 3,
        comments: 0,
        impressions: 42,
        likes: 0,
        saves: 3,
        views: 42,
      });
    });

    it('throws when Pinterest returns no metric values', async () => {
      (credentialsServiceMock.findOne as Mock).mockResolvedValue({
        accessToken: 'stored-token',
      });
      (httpServiceMock.get as Mock).mockReturnValue(
        of({ data: { metrics: {} } }),
      );

      await expect(
        service.getMediaAnalytics('org', 'brand', 'pin-1'),
      ).rejects.toThrow('Pinterest analytics returned no metric values');
    });
  });
});
