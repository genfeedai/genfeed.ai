import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { RedditService } from './reddit.service';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
    encrypt: vi.fn((value: string) => value),
  },
}));

describe('RedditService', () => {
  let service: RedditService;
  let credentialsService: ServerCredentialStore;
  let httpService: HttpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const credentialsMock = {
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
    credentialsMock.resolveBrandAccount.mockImplementation(
      (options: { credentialId?: string | null }) =>
        credentialsMock.findOne(options),
    );

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
          provide: SERVER_TOKENS.credentials,
          useValue: credentialsMock,
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<RedditService>(RedditService);
    credentialsService = module.get<ServerCredentialStore>(
      SERVER_TOKENS.credentials,
    );
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

  it('fetches global trends from the native r/all hot listing', async () => {
    (httpService.post as Mock).mockReturnValue(
      of({ data: { access_token: 'app-token', expires_in: 3600 } }),
    );
    (httpService.get as Mock).mockReturnValue(
      of({
        data: {
          data: {
            children: [
              {
                data: {
                  author: 'creator',
                  created_utc: 1_777_000_000,
                  id: 'post-1',
                  num_comments: 42,
                  permalink: '/r/all/comments/post-1/native_trend/',
                  score: 1200,
                  subreddit: 'all',
                  title: 'Native Reddit trend',
                  upvote_ratio: 0.95,
                },
              },
            ],
          },
        },
      }),
    );

    await expect(service.getTrends()).resolves.toEqual([
      expect.objectContaining({
        commentCount: 42,
        id: 'post-1',
        score: 1200,
        title: 'Native Reddit trend',
        upvoteRatio: 0.95,
      }),
    ]);
    expect(httpService.post).toHaveBeenCalledWith(
      'https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
    expect(httpService.get).toHaveBeenCalledWith(
      'https://oauth.reddit.com/r/all/hot',
      expect.objectContaining({ params: { limit: 20, raw_json: 1 } }),
    );
  });

  it('combines configured subreddit hot and daily top listings', async () => {
    (credentialsService.findOne as Mock).mockResolvedValue({
      externalId: '1w72r0ba',
    });
    (httpService.post as Mock).mockReturnValue(
      of({ data: { access_token: 'app-token', expires_in: 3600 } }),
    );
    (httpService.get as Mock)
      .mockReturnValueOnce(
        of({
          data: {
            data: {
              children: [
                {
                  data: {
                    id: 'hot-1',
                    score: 10,
                    subreddit: 'artificial',
                    title: 'Hot topic',
                  },
                },
              ],
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            data: {
              children: [
                {
                  data: {
                    id: 'top-1',
                    score: 20,
                    subreddit: 'artificial',
                    title: 'Top topic',
                  },
                },
              ],
            },
          },
        }),
      );

    const result = await service.getTrends('org', 'brand', 20, {
      subreddit: 'r/artificial',
    });

    expect(credentialsService.resolveBrandAccount).not.toHaveBeenCalled();
    expect(httpService.get).toHaveBeenNthCalledWith(
      1,
      'https://oauth.reddit.com/r/artificial/hot',
      expect.objectContaining({ params: { limit: 20, raw_json: 1 } }),
    );
    expect(httpService.get).toHaveBeenNthCalledWith(
      2,
      'https://oauth.reddit.com/r/artificial/top',
      expect.objectContaining({
        params: { limit: 20, raw_json: 1, t: 'day' },
      }),
    );
    expect(result.map((trend) => trend.id)).toEqual(['top-1', 'hot-1']);
  });

  it('uses r/all when a connected credential external id is an account id', async () => {
    (credentialsService.findOne as Mock).mockResolvedValue({
      externalId: '1w72r0ba',
    });
    (httpService.post as Mock).mockReturnValue(
      of({ data: { access_token: 'app-token', expires_in: 3600 } }),
    );
    (httpService.get as Mock).mockReturnValue(
      of({ data: { data: { children: [] } } }),
    );

    await expect(service.getTrends('org', 'brand')).resolves.toEqual([]);

    expect(httpService.get).toHaveBeenCalledOnce();
    expect(httpService.get).toHaveBeenCalledWith(
      'https://oauth.reddit.com/r/all/hot',
      expect.any(Object),
    );
  });

  it('supports the legacy r/name credential fallback', async () => {
    (credentialsService.findOne as Mock).mockResolvedValue({
      externalId: 'r/artificial',
    });
    (httpService.post as Mock).mockReturnValue(
      of({ data: { access_token: 'app-token', expires_in: 3600 } }),
    );
    (httpService.get as Mock).mockReturnValue(
      of({ data: { data: { children: [] } } }),
    );

    await service.getTrends('org', 'brand');

    expect(httpService.get).toHaveBeenNthCalledWith(
      1,
      'https://oauth.reddit.com/r/artificial/hot',
      expect.any(Object),
    );
    expect(httpService.get).toHaveBeenNthCalledWith(
      2,
      'https://oauth.reddit.com/r/artificial/top',
      expect.any(Object),
    );
  });

  it('uses r/all for a scoped request without a Reddit credential', async () => {
    (credentialsService.findOne as Mock).mockResolvedValue(null);
    (httpService.post as Mock).mockReturnValue(
      of({ data: { access_token: 'app-token', expires_in: 3600 } }),
    );
    (httpService.get as Mock).mockReturnValue(
      of({ data: { data: { children: [] } } }),
    );

    await expect(service.getTrends('org', 'brand')).resolves.toEqual([]);

    expect(httpService.get).toHaveBeenCalledWith(
      'https://oauth.reddit.com/r/all/hot',
      expect.any(Object),
    );
  });

  it('propagates native listing errors for orchestration fallback', async () => {
    (httpService.post as Mock).mockReturnValue(
      of({ data: { access_token: 'app-token', expires_in: 3600 } }),
    );
    (httpService.get as Mock).mockReturnValue(
      throwError(() => new Error('Reddit unavailable')),
    );

    await expect(service.getTrends()).rejects.toThrow('Reddit unavailable');
  });

  it('refreshes token', async () => {
    const orgId = testId('org');
    const brandId = testId('brand');
    (credentialsService.findOne as Mock).mockResolvedValue({
      id: 'cred',
      refreshToken: 'refresh',
    });
    (httpService.post as Mock).mockReturnValue(
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

  it('refreshes the account named by credentialId', async () => {
    // A brand may hold several Reddit accounts; token repair addresses the
    // named one instead of whichever happens to be the brand default.
    const orgId = testId('org');
    const brandId = testId('brand');
    (credentialsService.findOne as Mock).mockResolvedValue({
      id: 'cred-2',
      refreshToken: 'refresh',
    });
    (httpService.post as Mock).mockReturnValue(
      of({
        data: { access_token: 'a', expires_in: 3600, refresh_token: 'b' },
      }),
    );

    await service.refreshToken(orgId, brandId, 'cred-2');

    expect(credentialsService.resolveBrandAccount).toHaveBeenCalledWith({
      brandId,
      credentialId: 'cred-2',
      isDisconnectedIncluded: true,
      organizationId: orgId,
      platform: CredentialPlatform.REDDIT,
    });
  });

  describe('submitPost', () => {
    const orgId = testId('org');
    const brandId = testId('brand');

    beforeEach(() => {
      // `submitPost` always refreshes first, so the token exchange is the first
      // post call and the submission is the last one.
      (credentialsService.findOne as Mock).mockResolvedValue({
        id: 'cred',
        refreshToken: 'refresh',
      });
      (credentialsService.patch as Mock).mockResolvedValue({
        accessToken: 'access',
        id: 'cred',
      });
      (httpService.post as Mock)
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
        (httpService.post as Mock).mock.calls.at(-1)?.[1] as string,
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
