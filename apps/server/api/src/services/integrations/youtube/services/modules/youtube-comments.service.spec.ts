import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('YoutubeCommentsService', () => {
  let service: YoutubeCommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeCommentsService,
        {
          provide: YoutubeAuthService,
          useValue: { refreshToken: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<YoutubeCommentsService>(YoutubeCommentsService);
  });

  let mockAuthService: Record<string, unknown>;
  let mockYoutubeAPI: Record<string, unknown>;

  beforeEach(() => {
    mockAuthService = (service as unknown).authService;

    // Mock the YouTube API on the service instance
    mockYoutubeAPI = {
      channels: {
        list: vi.fn(),
      },
      commentThreads: {
        insert: vi.fn(),
      },
    };
    (service as unknown).youtubeAPI = mockYoutubeAPI;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('postComment', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const brandId = '507f1f77bcf86cd799439022';
    const videoId = 'dQw4w9WgXcQ';
    const commentText = 'Great video!';

    it('should post a comment and return commentId', async () => {
      const mockAuth = { credentials: { access_token: 'token' } };
      mockAuthService.refreshToken = vi.fn().mockResolvedValue(mockAuth);

      (mockYoutubeAPI.channels as Record<string, unknown>).list = vi
        .fn()
        .mockResolvedValue({
          data: { items: [{ id: 'UC123' }] },
        });

      (mockYoutubeAPI.commentThreads as Record<string, unknown>).insert = vi
        .fn()
        .mockResolvedValue({
          data: { id: 'comment_abc123' },
        });

      const result = await service.postComment(
        orgId,
        brandId,
        videoId,
        commentText,
      );

      expect(result).toEqual({ commentId: 'comment_abc123' });
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(orgId, brandId);
    });

    it('should throw when channel ID is not found', async () => {
      mockAuthService.refreshToken = vi.fn().mockResolvedValue({});

      (mockYoutubeAPI.channels as Record<string, unknown>).list = vi
        .fn()
        .mockResolvedValue({
          data: { items: [] },
        });

      await expect(
        service.postComment(orgId, brandId, videoId, commentText),
      ).rejects.toThrow('Could not retrieve channel ID');
    });

    it('should throw when no comment ID is returned', async () => {
      mockAuthService.refreshToken = vi.fn().mockResolvedValue({});

      (mockYoutubeAPI.channels as Record<string, unknown>).list = vi
        .fn()
        .mockResolvedValue({
          data: { items: [{ id: 'UC123' }] },
        });

      (mockYoutubeAPI.commentThreads as Record<string, unknown>).insert = vi
        .fn()
        .mockResolvedValue({
          data: { id: null },
        });

      await expect(
        service.postComment(orgId, brandId, videoId, commentText),
      ).rejects.toThrow('Failed to post comment - no comment ID returned');
    });

    it('should throw when auth refresh fails', async () => {
      mockAuthService.refreshToken = vi
        .fn()
        .mockRejectedValue(new Error('Auth failed'));

      await expect(
        service.postComment(orgId, brandId, videoId, commentText),
      ).rejects.toThrow('Auth failed');
    });

    it('should throw when YouTube API call fails', async () => {
      mockAuthService.refreshToken = vi.fn().mockResolvedValue({});

      (mockYoutubeAPI.channels as Record<string, unknown>).list = vi
        .fn()
        .mockRejectedValue(new Error('API quota exceeded'));

      await expect(
        service.postComment(orgId, brandId, videoId, commentText),
      ).rejects.toThrow('API quota exceeded');
    });
  });
});
