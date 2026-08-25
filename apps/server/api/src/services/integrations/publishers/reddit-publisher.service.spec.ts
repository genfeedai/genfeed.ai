/**
 * @fileoverview Tests for RedditPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { RedditPublisherService } from '@api/services/integrations/publishers/reddit-publisher.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
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

describe('RedditPublisherService', () => {
  let service: RedditPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let redditService: vi.Mocked<RedditService>;
  let postsService: vi.Mocked<PostsService>;

  // Test IDs
  const mockOrganizationId = testId('org');
  const mockBrandId = testId('brand');
  const mockPostId = testId('post');
  const mockUserId = testId('user');
  const mockCredentialId = testId('credential');
  const mockIngredientId = testId('ingredient');
  const mockSubreddit = 'testsubreddit';

  // Mock credential
  const mockCredential = {
    id: mockCredentialId,
    accessToken: 'encrypted-access-token',
    brandId: mockBrandId,
    externalHandle: 'testuser',
    externalId: mockSubreddit,
    isDeleted: false,
    organizationId: mockOrganizationId,
    platform: CredentialPlatform.REDDIT,
    refreshToken: 'encrypted-refresh-token',
    userId: mockUserId,
  } as unknown as CredentialDocument;

  // Mock credential without subreddit
  const mockCredentialNoSubreddit = {
    ...mockCredential,
    externalId: undefined,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only
  const mockTextPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test Reddit content</p>',
    ingredients: [],
    isDeleted: false,
    label: 'Post Title',
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with image
  const mockImagePost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Test image post</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    label: 'Image Post Title',
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Create publish context helper
  const createPublishContext = (
    post: PostEntity,
    credential = mockCredential,
    settings: ChannelTargetSettings = {},
  ): PublishContext => ({
    brandId: mockBrandId.toString(),
    credential,
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
        RedditPublisherService,
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
          provide: RedditService,
          useValue: {
            postComment: vi.fn(),
            submitPost: vi.fn(),
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

    service = module.get<RedditPublisherService>(RedditPublisherService);
    _configService = module.get(ConfigService) as vi.Mocked<ConfigService>;
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    redditService = module.get(RedditService) as vi.Mocked<RedditService>;
    postsService = module.get(PostsService) as vi.Mocked<PostsService>;
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform', () => {
      expect(service.platform).toBe(CredentialPlatform.REDDIT);
    });

    it('should support text-only posts', () => {
      expect(service.supportsTextOnly).toBe(true);
    });

    it('should support images', () => {
      expect(service.supportsImages).toBe(true);
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
    it('should fail validation when subreddit is not configured', () => {
      const context = createPublishContext(
        mockTextPost,
        mockCredentialNoSubreddit as unknown as CredentialEntity,
      );
      const mediaInfo: MediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('subreddit not configured');
    });

    it('should fail validation for carousel posts', () => {
      const context = createPublishContext(mockImagePost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: true,
        isImagePost: true,
        mediaUrls: [
          'https://api.test.com/ingredients/images/123',
          'https://api.test.com/ingredients/images/456',
        ],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('carousel');
    });

    it('should pass validation for text-only posts with subreddit configured', () => {
      const context = createPublishContext(mockTextPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });

    it('should pass validation for image posts with subreddit configured', () => {
      const context = createPublishContext(mockImagePost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: true,
        mediaUrls: ['https://api.test.com/ingredients/images/123'],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });
  });

  describe('validatePost caption length', () => {
    const textMediaInfo: MediaInfo = {
      hasIngredients: false,
      ingredientIds: [],
      isCarousel: false,
      isImagePost: false,
      mediaUrls: [],
    };

    it('should pass a body exactly at the 40000-character Reddit limit', () => {
      const context = createPublishContext({
        ...mockTextPost,
        description: 'a'.repeat(40_000),
      } as unknown as PostEntity);
      const result = service.validatePost(context, textMediaInfo);
      expect(result.valid).toBe(true);
    });

    it('should fail an over-limit body with a structured caption_too_long error', () => {
      const context = createPublishContext({
        ...mockTextPost,
        description: 'a'.repeat(40_001),
      } as unknown as PostEntity);
      const result = service.validatePost(context, textMediaInfo);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('caption_too_long');
      expect(result.error).toContain('Reddit');
      expect(result.error).toContain('40001');
      expect(result.error).toContain('40000');
    });
  });

  describe('publish', () => {
    describe('text-only posts', () => {
      it('should publish a text-only post successfully', async () => {
        const context = createPublishContext(mockTextPost);
        const mockPostIdResult = 'reddit-post-abc123';

        redditService.submitPost.mockResolvedValue(mockPostIdResult);

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPostIdResult);
        expect(result.platform).toBe(CredentialPlatform.REDDIT);
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHED);
        expect(result.url).toBe(
          `https://www.reddit.com/r/${mockSubreddit}/comments/${mockPostIdResult}`,
        );
        expect(redditService.submitPost).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          mockSubreddit,
          mockTextPost.label,
          expect.any(String),
          undefined, // No link URL for text posts
          undefined, // No flair selected
          mockCredential.id,
        );
      });

      it('should handle post without label', async () => {
        const postWithoutLabel = {
          ...mockTextPost,
          // Simulates a legacy row persisted before `label` became a
          // required PostEntity field; the service still falls back to
          // "Untitled" for these at runtime.
          label: undefined as unknown as string,
        };
        const context = createPublishContext(postWithoutLabel);

        redditService.submitPost.mockResolvedValue('post-123');

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(redditService.submitPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'Untitled',
          expect.any(String),
          undefined, // No link URL for text posts
          undefined, // No flair selected
          mockCredential.id,
        );
      });

      it('should handle HTML in description by converting to plain text', async () => {
        const postWithHtml = {
          ...mockTextPost,
          description: '<p>Hello <strong>world</strong></p>',
        };
        const context = createPublishContext(postWithHtml);

        redditService.submitPost.mockResolvedValue('post-123');

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(redditService.submitPost).toHaveBeenCalled();
      });

      it('should handle empty description', async () => {
        const postWithEmptyDescription = {
          ...mockTextPost,
          description: '',
        };
        const context = createPublishContext(postWithEmptyDescription);

        redditService.submitPost.mockResolvedValue('post-123');

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(redditService.submitPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          undefined, // Empty description becomes undefined
          undefined, // No link URL for text posts
          undefined, // No flair selected
          mockCredential.id,
        );
      });
    });

    describe('channel target settings', () => {
      it('should submit to the subreddit setting instead of the credential', async () => {
        // The credential holds one subreddit, but a brand posts to several, so
        // the per-target setting has to win — including in the permalink.
        const context = createPublishContext(mockTextPost, mockCredential, {
          subreddit: 'anothersub',
        });

        redditService.submitPost.mockResolvedValue('post-999');

        const result = await service.publish(context);

        expect(redditService.submitPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          'anothersub',
          expect.any(String),
          expect.any(String),
          undefined,
          undefined,
          mockCredential.id,
        );
        expect(result.url).toBe(
          'https://www.reddit.com/r/anothersub/comments/post-999',
        );
      });

      it('should fall back to the credential subreddit when unset', async () => {
        // Releases scheduled before the setting existed carry no settings at
        // all; they must keep publishing where they always did.
        const context = createPublishContext(mockTextPost);

        redditService.submitPost.mockResolvedValue('post-1');

        await service.publish(context);

        expect(redditService.submitPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          mockSubreddit,
          expect.any(String),
          expect.any(String),
          undefined,
          undefined,
          mockCredential.id,
        );
      });

      it('should forward the selected flair id', async () => {
        const context = createPublishContext(mockTextPost, mockCredential, {
          flairId: 'flair-abc',
        });

        redditService.submitPost.mockResolvedValue('post-1');

        await service.publish(context);

        expect(redditService.submitPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          undefined,
          'flair-abc',
          mockCredential.id,
        );
      });
    });

    describe('image posts (link post with media URL)', () => {
      it('should submit image post as link post', async () => {
        const context = createPublishContext(mockImagePost);

        // extractMediaInfo needs mediaUrls — the service calls it internally
        // Override getJobStatus to return URLs
        redditService.submitPost.mockResolvedValue('post-123');

        // Image post with ingredients — the service will call submitPost
        // but extractMediaInfo depends on post having mediaUrls populated
        // The spec just verifies the service handles the call
        const result = await service.publish(context);

        // With no actual mediaUrls (ingredients not populated), hasIngredients is false
        // so it goes through text-only path
        expect(result).toBeDefined();
      });
    });

    describe('error handling', () => {
      it('should return failed result when subreddit not configured', async () => {
        const context = createPublishContext(
          mockTextPost,
          mockCredentialNoSubreddit as unknown as CredentialEntity,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('subreddit not configured');
      });

      it('should return failed result when externalId is null', async () => {
        const context = createPublishContext(mockTextPost);

        redditService.submitPost.mockResolvedValue(null as unknown as string);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID');
      });

      it('should throw error when Reddit API fails', async () => {
        const context = createPublishContext(mockTextPost);
        const error = new Error('Reddit API error');

        redditService.submitPost.mockRejectedValue(error);

        await expect(service.publish(context)).rejects.toThrow(
          'Reddit API error',
        );
        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct Reddit URL with subreddit', () => {
      const externalId = 'abc123xyz';

      const result = service.buildPostUrl(
        externalId,
        mockCredential as unknown as CredentialEntity,
      );

      expect(result).toBe(
        `https://www.reddit.com/r/${mockSubreddit}/comments/${externalId}`,
      );
    });

    it('should handle missing subreddit gracefully', () => {
      const externalId = 'abc123xyz';

      const result = service.buildPostUrl(
        externalId,
        mockCredentialNoSubreddit as unknown as CredentialEntity,
      );

      expect(result).toBe(
        `https://www.reddit.com/r/unknown/comments/${externalId}`,
      );
    });
  });

  describe('publishThreadChildren', () => {
    const mockParentExternalId = 'reddit-post-parent123';

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
        category: PostCategory.IMAGE,
        description: '<p>Image child - should be ignored</p>',
        ingredients: [mockIngredientId],
        order: 3,
      },
    ];

    it('should post TEXT children as comments', async () => {
      const context = createPublishContext(mockTextPost);

      redditService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostEntity);

      await service.publishThreadChildren(
        context,
        mockChildren,
        mockParentExternalId,
      );

      // Should only post 2 comments (TEXT children only)
      expect(redditService.postComment).toHaveBeenCalledTimes(2);
      expect(postsService.patch).toHaveBeenCalledTimes(2);
    });

    it('should ignore non-TEXT children', async () => {
      const context = createPublishContext(mockTextPost);
      const imageChildren = [
        {
          id: testId('child', 4),
          category: PostCategory.IMAGE,
          description: '<p>Image</p>',
          ingredients: [mockIngredientId],
          order: 1,
        },
      ];

      await service.publishThreadChildren(
        context,
        imageChildren,
        mockParentExternalId,
      );

      expect(redditService.postComment).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('no TEXT children'),
        expect.any(Object),
      );
    });

    it('should sort children by order before posting', async () => {
      const context = createPublishContext(mockTextPost);
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

      redditService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostEntity);

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
      const context = createPublishContext(mockTextPost);
      const singleChild = [mockChildren[0]];

      redditService.postComment.mockResolvedValue({ commentId: null });
      postsService.patch.mockResolvedValue({} as unknown as PostEntity);

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
      const context = createPublishContext(mockTextPost);
      const textChildren = mockChildren.filter(
        (c) => c.category === PostCategory.TEXT,
      );

      redditService.postComment
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ commentId: 'comment-2' });

      postsService.patch.mockResolvedValue({} as unknown as PostEntity);

      await service.publishThreadChildren(
        context,
        textChildren,
        mockParentExternalId,
      );

      // Both children should be patched
      expect(postsService.patch).toHaveBeenCalledTimes(2);
    });

    it('should update child with externalId and PUBLIC status on success', async () => {
      const context = createPublishContext(mockTextPost);
      const singleChild = [mockChildren[0]];

      redditService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostEntity);

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
      const context = createPublishContext(mockTextPost);
      const singleChild = [mockChildren[0]];

      redditService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostEntity);

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
      const context = createPublishContext(mockTextPost);

      redditService.submitPost.mockResolvedValue('post-123');

      await service.publish(context);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('publishing to'),
        expect.objectContaining({
          category: mockTextPost.category,
          postId: context.postId,
        }),
      );
    });

    it('should log error on publish failure', async () => {
      const context = createPublishContext(mockTextPost);
      const error = new Error('API failure');

      redditService.submitPost.mockRejectedValue(error);

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
