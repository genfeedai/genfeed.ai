/**
 * @fileoverview Tests for YouTubePublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { YouTubePublisherService } from '@api/services/integrations/publishers/youtube-publisher.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import type { ChannelTargetSettings } from '@api-types/contracts/channel-capabilities.contract';
import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('YouTubePublisherService', () => {
  let service: YouTubePublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let youtubeService: vi.Mocked<YoutubeService>;
  let postsService: vi.Mocked<PostsService>;

  // Test IDs
  const mockOrganizationId = testId('org');
  const mockBrandId = testId('brand');
  const mockPostId = testId('post');
  const mockUserId = testId('user');
  const mockCredentialId = testId('credential');
  const mockIngredientId = testId('ingredient');

  // Mock credential
  const mockCredential = {
    id: mockCredentialId,
    accessToken: 'encrypted-access-token',
    brandId: mockBrandId,
    externalHandle: '@testchannel',
    externalId: 'youtube-channel-123',
    isDeleted: false,
    organizationId: mockOrganizationId,
    platform: CredentialPlatform.YOUTUBE,
    refreshToken: 'encrypted-refresh-token',
    userId: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only (not supported on YouTube)
  const mockTextPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test YouTube content</p>',
    ingredients: [],
    isDeleted: false,
    organizationId: mockOrganizationId,
    scheduledDate: new Date(),
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with image (not supported on YouTube)
  const mockImagePost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Test image post</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    organizationId: mockOrganizationId,
    scheduledDate: new Date(),
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with video
  const mockVideoPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.VIDEO,
    description: '<p>Test video post</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    label: 'Video Title',
    organizationId: mockOrganizationId,
    scheduledDate: new Date(),
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with video but no scheduled date
  const mockVideoPostNoSchedule = {
    ...mockVideoPost,
    scheduledDate: undefined,
  } as unknown as PostEntity;

  // Mock post with multiple videos (not supported)
  const mockMultiVideoPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.VIDEO,
    description: '<p>Multi video post</p>',
    ingredients: [testId('ingredient', 2), testId('ingredient', 3)],
    isDeleted: false,
    organizationId: mockOrganizationId,
    scheduledDate: new Date(),
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Create publish context helper
  const createPublishContext = (
    post: PostEntity,
    settings: ChannelTargetSettings = {},
  ): PublishContext => ({
    brandId: mockBrandId.toString(),
    credential: mockCredential,
    organization: mockOrganization,
    organizationId: mockOrganizationId.toString(),
    post,
    postId: mockPostId.toString(),
    settings,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YouTubePublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-value'),
            ingredientsEndpoint: 'https://api.test.com/ingredients',
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: YoutubeService,
          useValue: {
            postComment: vi.fn(),
            uploadVideo: vi.fn(),
          },
        },
        {
          provide: PostsService,
          useValue: {
            patch: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<YouTubePublisherService>(YouTubePublisherService);
    _configService = module.get(ConfigService) as vi.Mocked<ConfigService>;
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    youtubeService = module.get(YoutubeService) as vi.Mocked<YoutubeService>;
    postsService = module.get(PostsService) as vi.Mocked<PostsService>;
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform', () => {
      expect(service.platform).toBe(CredentialPlatform.YOUTUBE);
    });

    it('should NOT support text-only posts', () => {
      expect(service.supportsTextOnly).toBe(false);
    });

    it('should NOT support images', () => {
      expect(service.supportsImages).toBe(false);
    });

    it('should support videos', () => {
      expect(service.supportsVideos).toBe(true);
    });

    it('should NOT support carousel', () => {
      expect(service.supportsCarousel).toBe(false);
    });

    it('should support threads', () => {
      expect(service.supportsThreads).toBe(true);
    });
  });

  describe('validatePost', () => {
    it('should fail validation for image posts', () => {
      const context = createPublishContext(mockImagePost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: true,
        mediaUrls: ['https://api.test.com/ingredients/images/123'],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('YouTube does not support image posts');
    });

    it('should fail validation for multiple videos (carousel)', () => {
      const context = createPublishContext(mockMultiVideoPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: ['1', '2'],
        isCarousel: true,
        isImagePost: false,
        mediaUrls: [
          'https://api.test.com/ingredients/videos/1',
          'https://api.test.com/ingredients/videos/2',
        ],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('YouTube does not support multiple videos');
    });

    it('should fail validation when scheduledDate is missing', () => {
      const context = createPublishContext(mockVideoPostNoSchedule);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: ['https://api.test.com/ingredients/videos/123'],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('YouTube requires a scheduled date');
    });

    it('should pass validation for single video with scheduledDate', () => {
      const context = createPublishContext(mockVideoPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: ['https://api.test.com/ingredients/videos/123'],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });
  });

  describe('validatePost caption length', () => {
    const videoMediaInfo: MediaInfo = {
      hasIngredients: true,
      ingredientIds: [mockIngredientId.toString()],
      isCarousel: false,
      isImagePost: false,
      mediaUrls: ['https://api.test.com/ingredients/videos/123'],
    };

    it('should pass a description exactly at the 5000-character YouTube limit', () => {
      const context = createPublishContext({
        ...mockVideoPost,
        description: 'a'.repeat(5000),
      } as unknown as PostEntity);
      const result = service.validatePost(context, videoMediaInfo);
      expect(result.valid).toBe(true);
    });

    it('should fail an over-limit description with a structured caption_too_long error', () => {
      const context = createPublishContext({
        ...mockVideoPost,
        description: 'a'.repeat(5001),
      } as unknown as PostEntity);
      const result = service.validatePost(context, videoMediaInfo);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('caption_too_long');
      expect(result.error).toContain('YouTube');
      expect(result.error).toContain('5001');
      expect(result.error).toContain('5000');
    });
  });

  describe('publish', () => {
    describe('text-only posts (not supported)', () => {
      it('should return failed result for text-only posts', async () => {
        const context = createPublishContext(mockTextPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        // Text-only posts fail at the supportsTextOnly check or image check
        expect(result.executionState).toBe(TargetExecutionState.FAILED);
      });
    });

    describe('image posts (not supported)', () => {
      it('should return failed result for image posts', async () => {
        const context = createPublishContext(mockImagePost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('YouTube does not support image posts');
        expect(result.executionState).toBe(TargetExecutionState.FAILED);
      });
    });

    describe('video posts', () => {
      it('should publish a video successfully', async () => {
        const context = createPublishContext(mockVideoPost);
        const mockVideoId = 'dQw4w9WgXcQ';

        youtubeService.uploadVideo.mockResolvedValue(mockVideoId);

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockVideoId);
        expect(result.platform).toBe(CredentialPlatform.YOUTUBE);
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHED);
        expect(result.url).toBe(
          `https://www.youtube.com/watch?v=${mockVideoId}`,
        );
        expect(youtubeService.uploadVideo).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          mockIngredientId.toString(),
          mockVideoPost,
          {},
          mockCredential.id,
        );
      });

      it('should fail when scheduled date is missing', async () => {
        const context = createPublishContext(mockVideoPostNoSchedule);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('YouTube requires a scheduled date');
      });
    });

    describe('error handling', () => {
      it('should return failed result when externalId is null', async () => {
        const context = createPublishContext(mockVideoPost);

        youtubeService.uploadVideo.mockResolvedValue(null as unknown as string);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID');
      });

      it('should throw error when YouTube API fails', async () => {
        const context = createPublishContext(mockVideoPost);
        const error = new Error('YouTube API error');

        youtubeService.uploadVideo.mockRejectedValue(error);

        await expect(service.publish(context)).rejects.toThrow(
          'YouTube API error',
        );
        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct YouTube URL', () => {
      const externalId = 'dQw4w9WgXcQ';

      const result = service.buildPostUrl(externalId, mockCredential);

      expect(result).toBe(`https://www.youtube.com/watch?v=${externalId}`);
    });
  });

  describe('publishThreadChildren', () => {
    const mockParentExternalId = 'youtube-video-parent123';

    const mockChildren = [
      {
        id: testId('child', 1),
        category: PostCategory.TEXT,
        description: '<p>Comment 1</p>',
        order: 1,
      },
      {
        id: testId('child', 2),
        category: PostCategory.TEXT,
        description: '<p>Comment 2</p>',
        order: 2,
      },
      {
        id: testId('child', 3),
        category: PostCategory.VIDEO,
        description: '<p>Video child - should be ignored</p>',
        ingredients: [mockIngredientId],
        order: 3,
      },
    ];

    it('should post TEXT children as comments', async () => {
      const context = createPublishContext(mockVideoPost);

      youtubeService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        mockChildren,
        mockParentExternalId,
      );

      // Should only post 2 comments (TEXT children only)
      expect(youtubeService.postComment).toHaveBeenCalledTimes(2);
      expect(postsService.patch).toHaveBeenCalledTimes(2);
    });

    it('should ignore non-TEXT children', async () => {
      const context = createPublishContext(mockVideoPost);
      const videoChildren = [
        {
          id: testId('child', 4),
          category: PostCategory.VIDEO,
          description: '<p>Video</p>',
          ingredients: [mockIngredientId],
          order: 1,
        },
      ];

      await service.publishThreadChildren(
        context,
        videoChildren,
        mockParentExternalId,
      );

      expect(youtubeService.postComment).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('no TEXT children'),
        expect.any(Object),
      );
    });

    it('should sort children by order before posting', async () => {
      const context = createPublishContext(mockVideoPost);
      const unorderedChildren = [
        {
          id: testId('child', 5),
          category: PostCategory.TEXT,
          description: '<p>Second</p>',
          order: 2,
        },
        {
          id: testId('child', 6),
          category: PostCategory.TEXT,
          description: '<p>First</p>',
          order: 1,
        },
      ];

      youtubeService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        unorderedChildren,
        mockParentExternalId,
      );

      // First call should be for order 1
      expect(postsService.patch.mock.calls[0][0]).toBe(
        unorderedChildren[1].id.toString(),
      );
    });

    it('should mark child as failed when comment post fails', async () => {
      const context = createPublishContext(mockVideoPost);
      const singleChild = [mockChildren[0]];

      youtubeService.postComment.mockResolvedValue({ commentId: '' });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        singleChild,
        mockParentExternalId,
      );

      expect(postsService.patch).toHaveBeenCalledWith(
        singleChild[0].id.toString(),
        expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      );
    });

    it('should continue with other children when one fails', async () => {
      const context = createPublishContext(mockVideoPost);
      const textChildren = mockChildren.filter(
        (c) => c.category === PostCategory.TEXT,
      );

      youtubeService.postComment
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ commentId: 'comment-2' });

      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        textChildren,
        mockParentExternalId,
      );

      // Both children should be patched
      expect(postsService.patch).toHaveBeenCalledTimes(2);
    });

    it('should update child with externalId and PUBLIC status on success', async () => {
      const context = createPublishContext(mockVideoPost);
      const singleChild = [mockChildren[0]];

      youtubeService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        singleChild,
        mockParentExternalId,
      );

      expect(postsService.patch).toHaveBeenCalledWith(
        singleChild[0].id.toString(),
        expect.objectContaining({
          externalId: 'comment-123',
          publicationDate: expect.any(Date),
          targetExecutionState: TargetExecutionState.PUBLISHED,
        }),
      );
    });

    it('should log completion of comment posting', async () => {
      const context = createPublishContext(mockVideoPost);
      const singleChild = [mockChildren[0]];

      youtubeService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        singleChild,
        mockParentExternalId,
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('completed posting comments'),
        expect.any(Object),
      );
    });
  });

  describe('logging', () => {
    it('should log publish attempt', async () => {
      const context = createPublishContext(mockVideoPost);

      youtubeService.uploadVideo.mockResolvedValue('video-123');

      await service.publish(context);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('publishing to'),
        expect.objectContaining({
          category: mockVideoPost.category,
          postId: context.postId,
        }),
      );
    });

    it('should log successful video upload', async () => {
      const context = createPublishContext(mockVideoPost);
      const videoId = 'video-123';

      youtubeService.uploadVideo.mockResolvedValue(videoId);

      await service.publish(context);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining(`YouTube video uploaded with ID: ${videoId}`),
      );
    });

    it('should log error on publish failure', async () => {
      const context = createPublishContext(mockVideoPost);
      const error = new Error('API failure');

      youtubeService.uploadVideo.mockRejectedValue(error);

      await expect(service.publish(context)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to publish'),
        expect.objectContaining({
          error: error.message,
          postId: context.postId,
        }),
      );
    });
  });
});
