import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('RedditService', () => {
  let service: RedditService;
  let credentialsService: CredentialsService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                REDDIT_CLIENT_ID: 'id',
                REDDIT_CLIENT_SECRET: 'secret',
                REDDIT_REDIRECT_URI: 'http://localhost',
                REDDIT_USER_AGENT: 'test-agent',
              };
              return config[key];
            }),
          },
        },
        {
          provide: CredentialsService,
          useValue: { findOne: vi.fn(), patch: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<RedditService>(RedditService);
    credentialsService = module.get<CredentialsService>(CredentialsService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate auth url', () => {
    const url = service.generateAuthUrl('state');
    expect(url).toContain('https://www.reddit.com/api/v1/authorize');
    expect(url).toContain('state=state');
  });

  it('refreshes token', async () => {
    const orgId = '507f191e810c19729de860ea';
    const brandId = '507f191e810c19729de860eb';
    (credentialsService.findOne as vi.Mock).mockResolvedValue({
      _id: 'cred',
      refreshToken: 'refresh',
    });
    (httpService.post as vi.Mock).mockReturnValue(
      of({
        data: { access_token: 'a', expires_in: 3600, refresh_token: 'b' },
      }),
    );
    await service.refreshToken(orgId, brandId);
    expect(httpService.post).toHaveBeenCalled();
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'cred',
      expect.objectContaining({ accessToken: 'a' }),
    );
  });
});
