import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeCommentsService } from '@api/services/integrations/youtube/services/modules/youtube-comments.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

interface YoutubeAuthServiceMock {
  refreshToken: ReturnType<typeof vi.fn>;
}

interface YoutubeApiMock {
  channels: { list: ReturnType<typeof vi.fn> };
  comments: { insert: ReturnType<typeof vi.fn> };
  commentThreads: {
    insert: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
}

interface YoutubeCommentsServiceInternals {
  authService: YoutubeAuthServiceMock;
  youtubeAPI: YoutubeApiMock;
}

describe('YoutubeCommentsService', () => {
  let service: YoutubeCommentsService;
  let mockAuthService: YoutubeAuthServiceMock;
  let mockYoutubeAPI: YoutubeApiMock;

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
    const serviceInternals =
      service as unknown as YoutubeCommentsServiceInternals;
    mockAuthService = serviceInternals.authService;

    // Mock the YouTube API on the service instance
    mockYoutubeAPI = {
      channels: {
        list: vi.fn(),
      },
      comments: {
        insert: vi.fn(),
      },
      commentThreads: {
        insert: vi.fn(),
        list: vi.fn(),
      },
    };
    serviceInternals.youtubeAPI = mockYoutubeAPI;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('postComment', () => {
    const orgId = testId('org');
    const brandId = testId('brand');
    const videoId = 'dQw4w9WgXcQ';
    const commentText = 'Great video!';

    it('should post a comment and return commentId', async () => {
      const mockAuth = { credentials: { access_token: 'token' } };
      mockAuthService.refreshToken = vi.fn().mockResolvedValue(mockAuth);

      mockYoutubeAPI.channels.list = vi.fn().mockResolvedValue({
        data: { items: [{ id: 'UC123' }] },
      });

      mockYoutubeAPI.commentThreads.insert = vi.fn().mockResolvedValue({
        data: { id: 'comment_abc123' },
      });

      const result = await service.postComment(
        orgId,
        brandId,
        videoId,
        commentText,
      );

      expect(result).toEqual({ commentId: 'comment_abc123' });
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(
        orgId,
        brandId,
        undefined,
      );
    });

    it('should throw when channel ID is not found', async () => {
      mockAuthService.refreshToken = vi.fn().mockResolvedValue({});

      mockYoutubeAPI.channels.list = vi.fn().mockResolvedValue({
        data: { items: [] },
      });

      await expect(
        service.postComment(orgId, brandId, videoId, commentText),
      ).rejects.toThrow('Could not retrieve channel ID');
    });

    it('should throw when no comment ID is returned', async () => {
      mockAuthService.refreshToken = vi.fn().mockResolvedValue({});

      mockYoutubeAPI.channels.list = vi.fn().mockResolvedValue({
        data: { items: [{ id: 'UC123' }] },
      });

      mockYoutubeAPI.commentThreads.insert = vi.fn().mockResolvedValue({
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

      mockYoutubeAPI.channels.list = vi
        .fn()
        .mockRejectedValue(new Error('API quota exceeded'));

      await expect(
        service.postComment(orgId, brandId, videoId, commentText),
      ).rejects.toThrow('API quota exceeded');
    });
  });

  describe('listRecentChannelComments', () => {
    const orgId = testId('org');
    const brandId = testId('brand');

    it('lists normalized comments for the connected channel', async () => {
      const mockAuth = { credentials: { access_token: 'token' } };
      mockAuthService.refreshToken = vi.fn().mockResolvedValue(mockAuth);

      mockYoutubeAPI.channels.list = vi.fn().mockResolvedValue({
        data: { items: [{ id: 'UC123' }] },
      });

      mockYoutubeAPI.commentThreads.list = vi.fn().mockResolvedValue({
        data: {
          items: [
            {
              id: 'thread-1',
              snippet: {
                topLevelComment: {
                  id: 'comment-1',
                  snippet: {
                    authorChannelId: { value: 'author-channel-1' },
                    authorDisplayName: 'Viewer',
                    authorProfileImageUrl: 'https://example.com/avatar.jpg',
                    likeCount: 3,
                    publishedAt: '2026-07-01T10:00:00Z',
                    textDisplay: 'Nice clip',
                    textOriginal: 'Nice clip',
                    updatedAt: '2026-07-01T10:00:00Z',
                  },
                },
                videoId: 'video-1',
              },
            },
          ],
          nextPageToken: 'next-token',
        },
      });

      const result = await service.listRecentChannelComments(orgId, brandId, {
        maxResults: 10,
      });

      expect(result).toEqual({
        comments: [
          {
            authorChannelId: 'author-channel-1',
            authorDisplayName: 'Viewer',
            authorProfileImageUrl: 'https://example.com/avatar.jpg',
            commentId: 'comment-1',
            likeCount: 3,
            publishedAt: '2026-07-01T10:00:00Z',
            text: 'Nice clip',
            updatedAt: '2026-07-01T10:00:00Z',
            videoId: 'video-1',
            videoUrl: 'https://www.youtube.com/watch?v=video-1',
          },
        ],
        nextPageToken: 'next-token',
      });
      expect(mockYoutubeAPI.commentThreads.list).toHaveBeenCalledWith(
        expect.objectContaining({
          allThreadsRelatedToChannelId: 'UC123',
          auth: mockAuth,
          maxResults: 10,
          order: 'time',
          part: ['snippet'],
          textFormat: 'plainText',
        }),
      );
    });
  });

  describe('replyToComment', () => {
    const orgId = testId('org');
    const brandId = testId('brand');

    it('replies to an existing YouTube comment', async () => {
      const mockAuth = { credentials: { access_token: 'token' } };
      mockAuthService.refreshToken = vi.fn().mockResolvedValue(mockAuth);

      mockYoutubeAPI.comments.insert = vi.fn().mockResolvedValue({
        data: { id: 'reply-comment-1' },
      });

      const result = await service.replyToComment(
        orgId,
        brandId,
        'parent-comment-1',
        'Thanks for watching',
      );

      expect(result).toEqual({ commentId: 'reply-comment-1' });
      expect(mockYoutubeAPI.comments.insert).toHaveBeenCalledWith({
        auth: mockAuth,
        part: ['snippet'],
        requestBody: {
          snippet: {
            parentId: 'parent-comment-1',
            textOriginal: 'Thanks for watching',
          },
        },
      });
    });

    it('throws when YouTube does not return a reply comment ID', async () => {
      mockAuthService.refreshToken = vi.fn().mockResolvedValue({});

      mockYoutubeAPI.comments.insert = vi.fn().mockResolvedValue({
        data: { id: null },
      });

      await expect(
        service.replyToComment(
          orgId,
          brandId,
          'parent-comment-1',
          'Thanks for watching',
        ),
      ).rejects.toThrow('Failed to reply to comment - no comment ID returned');
    });
  });
});
