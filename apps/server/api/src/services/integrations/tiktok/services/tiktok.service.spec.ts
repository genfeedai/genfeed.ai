import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import {
  type TikTokPublishPost,
  TiktokService,
} from '@api/services/integrations/tiktok/services/tiktok.service';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import type { Mock } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => val),
    encrypt: vi.fn((val: string) => val),
  },
}));

function buildMockPost(
  overrides: Partial<TikTokPublishPost> = {},
): TikTokPublishPost {
  return {
    description: 'Test video description',
    label: 'Test video',
    ...overrides,
  };
}

function asCredential(value: Partial<CredentialDocument>): CredentialDocument {
  return value as CredentialDocument;
}

describe('TiktokService', () => {
  let service: TiktokService;
  let httpService: HttpService;
  let mockLoggerError: Mock;

  const configMock = {
    get: vi.fn((key: string) => {
      if (key === 'TIKTOK_CLIENT_KEY') {
        return 'key';
      }
      if (key === 'TIKTOK_CLIENT_SECRET') {
        return 'secret';
      }
      return '';
    }),
  } as unknown as ConfigService;

  const credentialsMock = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findOne: vi.fn().mockResolvedValue({
      accessToken: 'access',
      accessTokenExpiry: new Date(),
    }),
    mergeWarmupSignals: vi.fn().mockResolvedValue(undefined),
    patch: vi.fn().mockResolvedValue({}),
    // The service resolves its account through the multi-account resolver;
    // the double answers with whatever `findOne` is primed to return so the
    // existing single-account cases keep describing one connected account.
    resolveBrandAccount: vi.fn(),
  } satisfies ServerCredentialStore;
  credentialsMock.resolveBrandAccount.mockImplementation(
    (options: { credentialId?: string | null }) =>
      (credentialsMock.findOne as Mock)(options),
  );

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const httpServiceMock = {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as HttpService;

  beforeEach(async () => {
    mockLoggerError = vi.fn();
    loggerMock.error = mockLoggerError;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiktokService,
        { provide: ConfigService, useValue: configMock },
        { provide: SERVER_TOKENS.credentials, useValue: credentialsMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: HttpService, useValue: httpServiceMock },
      ],
    }).compile();

    service = module.get<TiktokService>(TiktokService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadVideo', () => {
    it('sends request and returns data', async () => {
      const mockPost = buildMockPost({ label: 'Test video' });

      // Mock credential selection to avoid token refresh during publish flow.
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        asCredential({ accessToken: 'test-token' }),
      );

      // Mock getCreatorInfo to avoid real API calls
      vi.spyOn(service, 'getCreatorInfo').mockResolvedValue({
        comment_disabled: false,
        creator_avatar_url: '',
        creator_nickname: 'Test',
        creator_username: 'test',
        duet_disabled: false,
        max_video_post_duration_sec: 600,
        privacy_level_options: ['SELF_ONLY'],
        stitch_disabled: false,
      });

      // Mock the HttpService post call
      (httpService.post as Mock).mockReturnValue(
        of({
          data: { data: { publish_id: 'test-id' } },
          status: 200,
        }),
      );

      // Mock the getPublishStatus call
      vi.spyOn(service, 'getPublishStatus').mockResolvedValue({
        publicly_available_post_id: ['post-123'],
        status: 'PUBLISH_COMPLETE',
      } as unknown as import('@genfeedai/contracts/interfaces').ITikTokPublishStatusData);

      const res = await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        mockPost,
      );

      expect(res.data?.post_id).toEqual('post-123');
      expect(httpService.post).toHaveBeenCalled();
    });

    it('uploads as the account named by credentialId', async () => {
      // A brand with two TikTok accounts publishes as the one the post belongs
      // to, never as whichever account happens to be the brand default.
      const mockPost = buildMockPost({ label: 'Test video' });

      const getValidCredential = vi
        .spyOn(service, 'getValidCredential')
        .mockResolvedValue(asCredential({ accessToken: 'test-token' }));

      vi.spyOn(service, 'getCreatorInfo').mockResolvedValue({
        comment_disabled: false,
        creator_avatar_url: '',
        creator_nickname: 'Test',
        creator_username: 'test',
        duet_disabled: false,
        max_video_post_duration_sec: 600,
        privacy_level_options: ['SELF_ONLY'],
        stitch_disabled: false,
      });

      (httpService.post as Mock).mockReturnValue(
        of({
          data: { data: { publish_id: 'test-id' } },
          status: 200,
        }),
      );

      vi.spyOn(service, 'getPublishStatus').mockResolvedValue({
        publicly_available_post_id: ['post-123'],
        status: 'PUBLISH_COMPLETE',
      } as unknown as import('@genfeedai/contracts/interfaces').ITikTokPublishStatusData);

      await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        mockPost,
        {},
        'credential-42',
      );

      expect(getValidCredential).toHaveBeenCalledWith(
        'org-id',
        'account-id',
        'credential-42',
      );
    });

    it('throws on non-200 response', async () => {
      const mockPost = buildMockPost({ label: 'Test video' });

      // Mock credential selection to avoid token refresh during publish flow.
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        asCredential({ accessToken: 'test-token' }),
      );

      // Mock getCreatorInfo to avoid real API calls
      vi.spyOn(service, 'getCreatorInfo').mockResolvedValue({
        comment_disabled: false,
        creator_avatar_url: '',
        creator_nickname: 'Test',
        creator_username: 'test',
        duet_disabled: false,
        max_video_post_duration_sec: 600,
        privacy_level_options: ['SELF_ONLY'],
        stitch_disabled: false,
      });

      (httpService.post as Mock).mockReturnValue(
        of({
          data: {},
          status: 500,
        }),
      );

      await expect(
        service.uploadVideo(
          'org-id',
          'account-id',
          'http://video.url',
          mockPost,
        ),
      ).rejects.toThrow('TikTok API returned non-200 status');

      expect(mockLoggerError).toHaveBeenCalled();
    });
  });

  describe('uploadVideoToInbox', () => {
    it('uploads the video to the connected account Inbox without direct-post polling', async () => {
      const getValidCredential = vi
        .spyOn(service, 'getValidCredential')
        .mockResolvedValue(asCredential({ accessToken: 'test-token' }));
      const getPublishStatus = vi.spyOn(service, 'getPublishStatus');
      (httpService.post as Mock).mockReturnValue(
        of({
          data: { data: { publish_id: 'v_inbox_file~123' } },
          status: 200,
        }),
      );

      const response = await service.uploadVideoToInbox(
        'org-id',
        'brand-id',
        'https://cdn.genfeed.ai/video.mp4',
        'credential-42',
      );

      expect(response.data?.publish_id).toBe('v_inbox_file~123');
      expect(getValidCredential).toHaveBeenCalledWith(
        'org-id',
        'brand-id',
        'credential-42',
      );
      expect(httpService.post).toHaveBeenCalledWith(
        'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
        {
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: 'https://cdn.genfeed.ai/video.mp4',
          },
        },
        {
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json; charset=UTF-8',
          },
        },
      );
      expect(getPublishStatus).not.toHaveBeenCalled();
    });

    it('rejects an Inbox upload response without a publish id', async () => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        asCredential({ accessToken: 'test-token' }),
      );
      (httpService.post as Mock).mockReturnValue(
        of({ data: { data: {} }, status: 200 }),
      );

      await expect(
        service.uploadVideoToInbox(
          'org-id',
          'brand-id',
          'https://cdn.genfeed.ai/video.mp4',
        ),
      ).rejects.toThrow('TikTok app upload failed: no publish_id returned');
    });
  });

  describe('channel target settings', () => {
    /**
     * The composer's choices only reach TikTok through the publish body, so
     * these assert the body rather than any intermediate helper.
     */
    const arrangeUpload = (
      creatorOverrides: Partial<{
        comment_disabled: boolean;
        duet_disabled: boolean;
        privacy_level_options: string[];
        stitch_disabled: boolean;
      }> = {},
    ) => {
      vi.spyOn(service, 'getValidCredential').mockResolvedValue(
        asCredential({ accessToken: 'test-token' }),
      );

      vi.spyOn(service, 'getCreatorInfo').mockResolvedValue({
        comment_disabled: false,
        creator_avatar_url: '',
        creator_nickname: 'Test',
        creator_username: 'test',
        duet_disabled: false,
        max_video_post_duration_sec: 600,
        privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'],
        stitch_disabled: false,
        ...creatorOverrides,
      });

      (httpService.post as Mock).mockReturnValue(
        of({
          data: { data: { publish_id: 'test-id' } },
          status: 200,
        }),
      );

      vi.spyOn(service, 'getPublishStatus').mockResolvedValue({
        publicly_available_post_id: ['post-123'],
        status: 'PUBLISH_COMPLETE',
      } as unknown as import('@genfeedai/contracts/interfaces').ITikTokPublishStatusData);
    };

    const postInfoOf = () =>
      (
        (httpService.post as Mock).mock.calls[0][1] as {
          post_info: Record<string, unknown>;
        }
      ).post_info;

    it('translates the catalog privacy value to TikTok vocabulary', async () => {
      arrangeUpload();

      await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        buildMockPost({ label: 'Test video' }),
        { privacyLevel: 'public' },
      );

      expect(postInfoOf().privacy_level).toBe('PUBLIC_TO_EVERYONE');
    });

    it('falls back to the safe default when the account cannot offer the requested level', async () => {
      // TikTok rejects the whole publish for a level missing from
      // `privacy_level_options`, so an unavailable choice must degrade.
      arrangeUpload({ privacy_level_options: ['SELF_ONLY'] });

      await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        buildMockPost({ label: 'Test video' }),
        { privacyLevel: 'public' },
      );

      expect(postInfoOf().privacy_level).toBe('SELF_ONLY');
    });

    it('disables the interactions the composer turned off', async () => {
      arrangeUpload();

      await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        buildMockPost({ label: 'Test video' }),
        { allowComments: false, allowDuet: false, allowStitch: true },
      );

      expect(postInfoOf()).toMatchObject({
        disable_comment: true,
        disable_duet: true,
        disable_stitch: false,
      });
    });

    it('keeps an account-disabled interaction disabled even when the composer allows it', async () => {
      // The account restriction is a ceiling, not a default.
      arrangeUpload({ comment_disabled: true });

      await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        buildMockPost({ label: 'Test video' }),
        { allowComments: true },
      );

      expect(postInfoOf().disable_comment).toBe(true);
    });

    it('leaves interactions enabled when the composer set nothing', async () => {
      arrangeUpload();

      await service.uploadVideo(
        'org-id',
        'account-id',
        'http://video.url',
        buildMockPost({ label: 'Test video' }),
      );

      expect(postInfoOf()).toMatchObject({
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      });
    });
  });

  describe('refreshToken', () => {
    it('refreshes token and saves credentials', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        id: 'credential-id',
        refreshToken: 'ref',
      });

      (httpService.post as Mock).mockReturnValue(
        of({
          data: {
            access_token: 'nac',
            expires_in: 10,
            refresh_token: 'nref',
            refresh_expires_in: 20,
          },
        }),
      );

      (credentialsMock.patch as Mock).mockResolvedValue({
        id: 'credential-id',
        accessToken: 'nac',
        isConnected: true,
        oauthTokenHash: null,
        refreshToken: 'nref',
      });

      const result = await service.refreshToken(testId('org'), testId('brand'));

      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'nac',
          id: 'credential-id',
          oauthTokenHash: '',
        }),
      );
      expect(httpService.post).toHaveBeenCalled();
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        accessToken: 'nac',
        accessTokenExpiry: expect.any(Date),
        isConnected: true,
        refreshToken: 'nref',
        refreshTokenExpiry: expect.any(Date),
      });
    });

    it('throws when no refresh token exists', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue(undefined);

      await expect(
        service.refreshToken(testId('org'), testId('brand')),
      ).rejects.toThrow('No refresh token available');
    });

    it('persists the exact scopes returned by token refresh through an atomic merge', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        id: 'credential-id',
        refreshToken: 'ref',
        warmupSignals: { connectedDays: 2 },
      });
      (httpService.post as Mock).mockReturnValue(
        of({
          data: {
            access_token: 'nac',
            expires_in: 10,
            refresh_token: 'nref',
            refresh_expires_in: 20,
            scope: 'video.list,user.info.basic,video.list',
          },
        }),
      );
      (credentialsMock.patch as Mock).mockResolvedValue({
        id: 'credential-id',
        oauthTokenHash: null,
      });

      await service.refreshToken('org-id', 'brand-id');

      // The scope observation merges its own key in the database; rewriting
      // the whole warmupSignals object from the pre-refresh read would drop
      // evidence persisted concurrently by other warmup writers.
      expect(credentialsMock.patch).toHaveBeenCalledWith(
        'credential-id',
        expect.objectContaining({
          grantedScopes: ['user.info.basic', 'video.list'],
          grantedScopesCapturedAt: expect.any(Date),
        }),
      );
      expect(credentialsMock.mergeWarmupSignals).toHaveBeenCalledWith(
        'credential-id',
        'org-id',
        {
          tiktokAuthorization: {
            grantedScopes: ['user.info.basic', 'video.list'],
            observedAt: expect.any(String),
          },
        },
      );
      expect(credentialsMock.patch).toHaveBeenCalledWith(
        'credential-id',
        expect.not.objectContaining({ warmupSignals: expect.anything() }),
      );
    });
  });

  describe('getTiktokInfo', () => {
    it('requests only user fields exposed by the exact granted scopes', async () => {
      (httpService.get as Mock).mockReturnValue(
        of({
          data: {
            data: {
              user: {
                avatar_url: 'https://example.com/avatar.jpg',
                display_name: 'Creator',
                open_id: 'creator-id',
              },
            },
          },
        }),
      );

      await service.getTiktokInfo(
        'org-id',
        'brand-id',
        'access-token',
        'user.info.basic',
      );

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/user/info/'),
        expect.objectContaining({
          params: {
            fields: 'open_id,union_id,avatar_url,display_name',
          },
        }),
      );
    });

    it('returns a deterministic empty profile without requesting when no user.info scope is granted', async () => {
      const result = await service.getTiktokInfo(
        'org-id',
        'brand-id',
        'access-token',
        'video.list,video.publish',
      );

      expect(httpService.get).not.toHaveBeenCalled();
      expect(result).toEqual({
        isConnected: true,
        platform: 'tiktok',
      });
    });

    it('treats an explicitly empty scope grant as no selectable fields', async () => {
      const result = await service.getTiktokInfo(
        'org-id',
        'brand-id',
        'access-token',
        [],
      );

      expect(httpService.get).not.toHaveBeenCalled();
      expect(result.username).toBeUndefined();
      expect(result.isConnected).toBe(true);
    });
  });

  describe('handleAuthorizationError', () => {
    it('reuses the reconnect lifecycle only for revoked credentials', async () => {
      const revoked = await service.handleAuthorizationError(
        'credential-id',
        {
          response: {
            data: { error: { code: 'access_token_invalid' } },
            status: 401,
          },
        },
        'signal refresh',
      );
      const permissionLimited = await service.handleAuthorizationError(
        'credential-id',
        {
          response: {
            data: { error: { code: 'scope_not_authorized' } },
            status: 401,
          },
        },
        'signal refresh',
      );

      expect(revoked).toBe(true);
      expect(permissionLimited).toBe(false);
      expect(credentialsMock.patch).toHaveBeenCalledTimes(1);
      expect(credentialsMock.patch).toHaveBeenCalledWith('credential-id', {
        isConnected: false,
      });
    });
  });

  describe('getValidCredential', () => {
    it('returns stored credential when access token is not near expiry', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        accessToken: 'fresh-access',
        accessTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
        id: 'credential-id',
        oauthTokenHash: '',
        refreshToken: 'refresh-token',
      });

      const refreshSpy = vi.spyOn(service, 'refreshToken');

      const result = await service.getValidCredential('org-id', 'brand-id');

      expect(result.accessToken).toBe('fresh-access');
      expect(result.oauthTokenHash).toBe('');
      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('refreshes when access token is inside the refresh buffer', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        accessToken: 'stale-access',
        accessTokenExpiry: new Date(Date.now() + 5 * 60 * 1000),
        id: 'credential-id',
        refreshToken: 'refresh-token',
      });
      const refreshedCredential = asCredential({
        accessToken: 'new-access',
        id: 'credential-id',
        oauthTokenHash: '',
      });
      const refreshSpy = vi
        .spyOn(service, 'refreshToken')
        .mockResolvedValue(refreshedCredential);

      const result = await service.getValidCredential('org-id', 'brand-id');

      expect(refreshSpy).toHaveBeenCalledWith('org-id', 'brand-id', undefined);
      expect(result.accessToken).toBe('new-access');
    });
  });

  describe('getTrends', () => {
    it('returns empty trends without credentials', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue(null);

      const result = await service.getTrends('o', 'a');

      expect(result).toEqual([]);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('maps connected account videos without static fallback trends', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        accessToken: 'access',
        accessTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
        id: 'credential-id',
        isConnected: true,
        oauthTokenHash: '',
      });
      (httpService.get as Mock).mockReturnValue(
        of({
          data: {
            data: {
              videos: [
                {
                  create_time: 1720000000,
                  id: 'video-1',
                  statistics: { view_count: 25 },
                  title: 'launch tips',
                },
              ],
            },
          },
        }),
      );

      const result = await service.getTrends('o', 'a');

      expect(result).toEqual([
        {
          growthRate: 0,
          mentions: 25,
          metadata: { createdAt: 1720000000, videoId: 'video-1' },
          topic: '#launch tips',
        },
      ]);
    });
  });

  describe('getMediaAnalytics', () => {
    it('returns stats', async () => {
      (credentialsMock.findOne as Mock).mockResolvedValue({
        accessToken: 'tok',
        accessTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
        id: 'credential-id',
        oauthTokenHash: '',
      });

      (httpService.get as Mock).mockReturnValue(
        of({
          data: {
            data: {
              videos: [
                {
                  comment_count: 1,
                  download_count: 0,
                  like_count: 2,
                  share_count: 0,
                  view_count: 5,
                },
              ],
            },
          },
        }),
      );

      const res = await service.getMediaAnalytics(
        testId('org'),
        testId('brand'),
        'v',
      );

      expect(httpService.get).toHaveBeenCalled();
      expect(res).toEqual({
        averageWatchTime: undefined,
        comments: 1,
        completionRate: undefined,
        downloads: undefined,
        engagementRate: 60,
        impressions: undefined,
        likes: 2,
        mediaType: 'video',
        reach: undefined,
        shares: undefined,
        views: 5,
      });
    });
  });
});
