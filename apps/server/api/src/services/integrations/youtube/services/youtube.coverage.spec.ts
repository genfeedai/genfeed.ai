// Break circular dependencies: both YoutubeAnalyticsService and YoutubeMetadataService import YoutubeService
vi.mock(
  '@api/services/integrations/youtube/services/modules/youtube-analytics.service',
  () => ({
    YoutubeAnalyticsService: vi.fn(),
  }),
);

vi.mock(
  '@api/services/integrations/youtube/services/modules/youtube-metadata.service',
  () => ({
    YoutubeMetadataService: vi.fn(),
  }),
);

// Mock YoutubeOAuth2Util so generateAuthUrl / exchangeCodeForTokens can be tested
// without real Google OAuth credentials.
vi.mock('@api/shared/utils/youtube-oauth/youtube-oauth.util', () => ({
  YoutubeOAuth2Util: {
    createClient: vi.fn(),
  },
}));

import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import { YoutubeAnalyticsService } from '@api/services/integrations/youtube/services/modules/youtube-analytics.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockOAuth2Client(
  overrides: Partial<{
    generateAuthUrl: ReturnType<typeof vi.fn>;
    getToken: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    generateAuthUrl:
      overrides.generateAuthUrl ?? vi.fn().mockReturnValue('https://oauth.url'),
    getToken:
      overrides.getToken ??
      vi.fn().mockResolvedValue({ tokens: { access_token: 'tok' } }),
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('YoutubeService — extended coverage', () => {
  let service: YoutubeService;
  let authService: vi.Mocked<YoutubeAuthService>;
  let metadataService: vi.Mocked<YoutubeMetadataService>;
  let uploadService: vi.Mocked<YoutubeUploadService>;
  let analyticsService: vi.Mocked<YoutubeAnalyticsService>;
  let commentsService: vi.Mocked<YoutubeCommentsService>;
  let mockCreateClient: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    authService = {
      refreshToken: vi.fn(),
    } as unknown as vi.Mocked<YoutubeAuthService>;

    metadataService = {
      getVideoMetadata: vi.fn(),
      getVideoStatus: vi.fn(),
    } as unknown as vi.Mocked<YoutubeMetadataService>;

    uploadService = {
      uploadVideo: vi.fn(),
    } as unknown as vi.Mocked<YoutubeUploadService>;

    analyticsService = {
      getChannelDetails: vi.fn(),
      getMediaAnalytics: vi.fn(),
      getMediaAnalyticsBatch: vi.fn(),
      getTrends: vi.fn(),
    } as unknown as vi.Mocked<YoutubeAnalyticsService>;

    commentsService = {
      postComment: vi.fn(),
    } as unknown as vi.Mocked<YoutubeCommentsService>;

    mockCreateClient = YoutubeOAuth2Util.createClient as unknown as ReturnType<
      typeof vi.fn
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string) => {
              const map: Record<string, string> = {
                YOUTUBE_API_KEY: 'test-api-key',
                YOUTUBE_CLIENT_ID: 'test-client-id',
                YOUTUBE_CLIENT_SECRET: 'test-client-secret',
                YOUTUBE_REDIRECT_URI: 'https://redirect.uri',
              };
              return map[key] ?? '';
            }),
          },
        },
        { provide: YoutubeAuthService, useValue: authService },
        { provide: YoutubeMetadataService, useValue: metadataService },
        { provide: YoutubeUploadService, useValue: uploadService },
        { provide: YoutubeAnalyticsService, useValue: analyticsService },
        { provide: YoutubeCommentsService, useValue: commentsService },
      ],
    }).compile();

    service = module.get(YoutubeService);
  });

  // -------------------------------------------------------------------------
  // getVideoStatus
  // -------------------------------------------------------------------------

  describe('getVideoStatus', () => {
    it('delegates to metadataService.getVideoStatus with correct args', async () => {
      const expected = { status: 'uploaded' };
      metadataService.getVideoStatus.mockResolvedValue(expected as never);

      const result = await service.getVideoStatus('org-1', 'brand-1', 'vid-1');

      expect(metadataService.getVideoStatus).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'vid-1',
      );
      expect(result).toBe(expected);
    });

    it('propagates rejection from metadataService.getVideoStatus', async () => {
      const err = new Error('status fetch failed');
      metadataService.getVideoStatus.mockRejectedValue(err);

      await expect(
        service.getVideoStatus('org', 'brand', 'vid'),
      ).rejects.toThrow('status fetch failed');
    });
  });

  // -------------------------------------------------------------------------
  // getChannelDetails
  // -------------------------------------------------------------------------

  describe('getChannelDetails', () => {
    it('delegates to analyticsService.getChannelDetails without optional arg', async () => {
      const expected = { channelId: 'UC123' };
      analyticsService.getChannelDetails.mockResolvedValue(expected as never);

      const result = await service.getChannelDetails('org-2', 'brand-2');

      expect(analyticsService.getChannelDetails).toHaveBeenCalledWith(
        'org-2',
        'brand-2',
        undefined,
      );
      expect(result).toBe(expected);
    });

    it('passes authOrSkipRefresh through to analyticsService', async () => {
      analyticsService.getChannelDetails.mockResolvedValue({} as never);
      const fakeAuth = { token: 'some-auth' };

      await service.getChannelDetails('org-3', 'brand-3', fakeAuth);

      expect(analyticsService.getChannelDetails).toHaveBeenCalledWith(
        'org-3',
        'brand-3',
        fakeAuth,
      );
    });

    it('propagates rejection from analyticsService.getChannelDetails', async () => {
      const err = new Error('channel fetch failed');
      analyticsService.getChannelDetails.mockRejectedValue(err);

      await expect(service.getChannelDetails('org', 'brand')).rejects.toThrow(
        'channel fetch failed',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getMediaAnalyticsBatch
  // -------------------------------------------------------------------------

  describe('getMediaAnalyticsBatch', () => {
    it('delegates to analyticsService.getMediaAnalyticsBatch with videoIds array', async () => {
      const expected = [{ videoId: 'vid-a' }, { videoId: 'vid-b' }];
      analyticsService.getMediaAnalyticsBatch.mockResolvedValue(
        expected as never,
      );

      const result = await service.getMediaAnalyticsBatch('org', 'brand', [
        'vid-a',
        'vid-b',
      ]);

      expect(analyticsService.getMediaAnalyticsBatch).toHaveBeenCalledWith(
        'org',
        'brand',
        ['vid-a', 'vid-b'],
      );
      expect(result).toBe(expected);
    });

    it('delegates with empty array', async () => {
      analyticsService.getMediaAnalyticsBatch.mockResolvedValue([] as never);

      await service.getMediaAnalyticsBatch('org', 'brand', []);

      expect(analyticsService.getMediaAnalyticsBatch).toHaveBeenCalledWith(
        'org',
        'brand',
        [],
      );
    });

    it('propagates rejection from analyticsService.getMediaAnalyticsBatch', async () => {
      const err = new Error('batch analytics failed');
      analyticsService.getMediaAnalyticsBatch.mockRejectedValue(err);

      await expect(
        service.getMediaAnalyticsBatch('org', 'brand', ['v1']),
      ).rejects.toThrow('batch analytics failed');
    });
  });

  // -------------------------------------------------------------------------
  // getTrends — explicit regionCode override (default 'US' covered in base spec)
  // -------------------------------------------------------------------------

  describe('getTrends — region override', () => {
    it('passes explicit regionCode to analyticsService', async () => {
      analyticsService.getTrends.mockResolvedValue([] as never);

      await service.getTrends('org', 'brand', 'GB');

      expect(analyticsService.getTrends).toHaveBeenCalledWith(
        'org',
        'brand',
        'GB',
      );
    });

    it('uses default regionCode US when omitted', async () => {
      analyticsService.getTrends.mockResolvedValue([] as never);

      await service.getTrends('org', 'brand');

      expect(analyticsService.getTrends).toHaveBeenCalledWith(
        'org',
        'brand',
        'US',
      );
    });

    it('works without organizationId and brandId', async () => {
      analyticsService.getTrends.mockResolvedValue([] as never);

      await service.getTrends(undefined, undefined, 'JP');

      expect(analyticsService.getTrends).toHaveBeenCalledWith(
        undefined,
        undefined,
        'JP',
      );
    });
  });

  // -------------------------------------------------------------------------
  // postComment
  // -------------------------------------------------------------------------

  describe('postComment', () => {
    it('delegates to commentsService.postComment with correct args', async () => {
      const expected = 'comment-id-42';
      commentsService.postComment.mockResolvedValue(expected as never);

      const result = await service.postComment(
        'org',
        'brand',
        'vid-99',
        'Hello world',
      );

      expect(commentsService.postComment).toHaveBeenCalledWith(
        'org',
        'brand',
        'vid-99',
        'Hello world',
      );
      expect(result).toBe(expected);
    });

    it('propagates rejection from commentsService.postComment', async () => {
      const err = new Error('comment failed');
      commentsService.postComment.mockRejectedValue(err);

      await expect(
        service.postComment('org', 'brand', 'vid', 'text'),
      ).rejects.toThrow('comment failed');
    });
  });

  // -------------------------------------------------------------------------
  // parseDuration — pure function, all ISO 8601 PT branches
  // -------------------------------------------------------------------------

  describe('parseDuration', () => {
    it('returns 0 for a non-matching string', () => {
      expect(service.parseDuration('invalid')).toBe(0);
    });

    it('returns 0 for empty string', () => {
      expect(service.parseDuration('')).toBe(0);
    });

    it('parses seconds only', () => {
      expect(service.parseDuration('PT45S')).toBe(45);
    });

    it('parses minutes only', () => {
      expect(service.parseDuration('PT10M')).toBe(600);
    });

    it('parses hours only', () => {
      expect(service.parseDuration('PT2H')).toBe(7200);
    });

    it('parses minutes and seconds', () => {
      expect(service.parseDuration('PT3M30S')).toBe(210);
    });

    it('parses hours and minutes', () => {
      expect(service.parseDuration('PT1H15M')).toBe(4500);
    });

    it('parses hours and seconds without minutes', () => {
      expect(service.parseDuration('PT1H30S')).toBe(3630);
    });

    it('parses full H, M, S combination', () => {
      expect(service.parseDuration('PT1H2M3S')).toBe(3723);
    });

    it('handles zero-valued components', () => {
      expect(service.parseDuration('PT0H0M0S')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // generateAuthUrl
  // -------------------------------------------------------------------------

  describe('generateAuthUrl', () => {
    it('creates an OAuth2 client and calls generateAuthUrl with mapped options', () => {
      const mockClient = makeMockOAuth2Client();
      mockCreateClient.mockReturnValue(mockClient);

      const result = service.generateAuthUrl({
        accessType: 'offline',
        includeGrantedScopes: true,
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/youtube.upload'],
        state: 'state-abc',
      });

      expect(mockCreateClient).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'https://redirect.uri',
      );
      expect(mockClient.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          include_granted_scopes: true,
          prompt: 'consent',
          scope: ['https://www.googleapis.com/auth/youtube.upload'],
          state: 'state-abc',
        }),
      );
      expect(result).toBe('https://oauth.url');
    });

    it('defaults access_type to offline and prompt to consent when not provided', () => {
      const mockClient = makeMockOAuth2Client();
      mockCreateClient.mockReturnValue(mockClient);

      service.generateAuthUrl({
        scope: ['https://www.googleapis.com/auth/youtube'],
        state: 'state-xyz',
      });

      expect(mockClient.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          include_granted_scopes: false,
          prompt: 'consent',
        }),
      );
    });

    it('defaults include_granted_scopes to false when not provided', () => {
      const mockClient = makeMockOAuth2Client();
      mockCreateClient.mockReturnValue(mockClient);

      service.generateAuthUrl({
        scope: [],
        state: 's',
      });

      expect(mockClient.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ include_granted_scopes: false }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // exchangeCodeForTokens
  // -------------------------------------------------------------------------

  describe('exchangeCodeForTokens', () => {
    it('creates an OAuth2 client and exchanges the code for tokens', async () => {
      const tokenResponse = {
        tokens: { access_token: 'access-tok', refresh_token: 'refresh-tok' },
      };
      const mockClient = makeMockOAuth2Client({
        getToken: vi.fn().mockResolvedValue(tokenResponse),
      });
      mockCreateClient.mockReturnValue(mockClient);

      const result = await service.exchangeCodeForTokens('auth-code-123');

      expect(mockCreateClient).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'https://redirect.uri',
      );
      expect(mockClient.getToken).toHaveBeenCalledWith('auth-code-123');
      expect(result).toBe(tokenResponse);
    });

    it('propagates token exchange errors', async () => {
      const err = new Error('invalid_grant');
      const mockClient = makeMockOAuth2Client({
        getToken: vi.fn().mockRejectedValue(err),
      });
      mockCreateClient.mockReturnValue(mockClient);

      await expect(service.exchangeCodeForTokens('bad-code')).rejects.toThrow(
        'invalid_grant',
      );
    });
  });
});
