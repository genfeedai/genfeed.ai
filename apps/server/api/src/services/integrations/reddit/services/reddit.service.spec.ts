import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { ConfigService } from '@libs/config/config.service';
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
      id: 'cred',
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

  describe('submitPost', () => {
    const orgId = '507f191e810c19729de860ea';
    const brandId = '507f191e810c19729de860eb';

    beforeEach(() => {
      // `submitPost` always refreshes first, so the token exchange is the first
      // post call and the submission is the last one.
      (credentialsService.findOne as vi.Mock).mockResolvedValue({
        id: 'cred',
        refreshToken: 'refresh',
      });
      (credentialsService.patch as vi.Mock).mockResolvedValue({
        accessToken: 'access',
        id: 'cred',
      });
      (httpService.post as vi.Mock)
        .mockReturnValueOnce(
          of({
            data: { access_token: 'a', expires_in: 3600, refresh_token: 'b' },
          }),
        )
        .mockReturnValue(of({ data: { json: { data: { id: 'post-1' } } } }));
    });

    // Reddit takes the submission as form-encoded, so the assertions parse the
    // body back rather than matching a serialised string.
    const submittedParams = () =>
      new URLSearchParams(
        (httpService.post as vi.Mock).mock.calls.at(-1)?.[1] as string,
      );

    it('sends the flair id when one is selected', async () => {
      await service.submitPost(
        orgId,
        brandId,
        'testsubreddit',
        'Title',
        'Body',
        undefined,
        'flair-abc',
      );

      expect(submittedParams().get('flair_id')).toBe('flair-abc');
    });

    it('omits the flair id when none is selected', async () => {
      // Many subreddits reject an unknown flair id, so an unset setting has to
      // leave the field off entirely rather than send an empty value.
      await service.submitPost(
        orgId,
        brandId,
        'testsubreddit',
        'Title',
        'Body',
      );

      expect(submittedParams().has('flair_id')).toBe(false);
    });

    it('submits to the subreddit it was given', async () => {
      await service.submitPost(orgId, brandId, 'anothersub', 'Title', 'Body');

      expect(submittedParams().get('sr')).toBe('anothersub');
    });
  });
});
