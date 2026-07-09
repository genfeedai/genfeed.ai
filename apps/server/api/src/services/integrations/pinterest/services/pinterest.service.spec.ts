import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

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
    findOne: vi.fn(),
    patch: vi.fn(),
  } as unknown as CredentialsService;

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
          provide: CredentialsService,
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
    (httpServiceMock.post as vi.Mock).mockReturnValue(
      of({ data: { id: '1' } }),
    );

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
    (httpServiceMock.post as vi.Mock).mockReturnValue(
      of({ data: { access_token: 'a', refresh_token: 'r' } }),
    );

    const tokens = await service.exchangeCodeForToken('code');

    expect(httpServiceMock.post).toHaveBeenCalled();
    expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('searchPins returns items', async () => {
    (httpServiceMock.get as vi.Mock).mockReturnValue(
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
    (httpServiceMock.get as vi.Mock).mockReturnValue(
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

  describe('getMediaAnalytics', () => {
    it('maps Pinterest provider metrics using the stored credential', async () => {
      (credentialsServiceMock.findOne as vi.Mock).mockResolvedValue({
        accessToken: 'stored-token',
      });
      (httpServiceMock.get as vi.Mock).mockReturnValue(
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

      expect(credentialsServiceMock.findOne).toHaveBeenCalledWith({
        brand: 'brand',
        organization: 'org',
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
      (credentialsServiceMock.findOne as vi.Mock).mockResolvedValue(null);

      await expect(
        service.getMediaAnalytics('org', 'brand', 'pin-1'),
      ).rejects.toThrow('Pinterest credential not found');

      expect(httpServiceMock.get).not.toHaveBeenCalled();
    });

    it('throws when Pinterest returns no metric values', async () => {
      (credentialsServiceMock.findOne as vi.Mock).mockResolvedValue({
        accessToken: 'stored-token',
      });
      (httpServiceMock.get as vi.Mock).mockReturnValue(
        of({ data: { metrics: {} } }),
      );

      await expect(
        service.getMediaAnalytics('org', 'brand', 'pin-1'),
      ).rejects.toThrow('Pinterest analytics returned no metric values');
    });
  });
});
