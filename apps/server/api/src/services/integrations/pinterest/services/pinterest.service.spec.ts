import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('PinterestService', () => {
  let service: PinterestService;
  const httpServiceMock = {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as HttpService;

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
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
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
});
