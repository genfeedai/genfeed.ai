/**
 * @fileoverview Tests for InstagramPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { ChannelTargetSettings } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('InstagramPublisherService', () => {
  let service: InstagramPublisherService;
  let logger: vi.Mocked<LoggerService>;
  let instagramService: vi.Mocked<InstagramService>;
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
    externalHandle: 'testuser',
    isDeleted: false,
    organizationId: mockOrganizationId,
    platform: CredentialPlatform.INSTAGRAM,
    userId: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only (not supported on Instagram)
  const mockTextPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test Instagram content</p>',
    ingredients: [],
    isDeleted: false,
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
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with video
  const mockVideoPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.VIDEO,
    description: '<p>Test video reel</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    isShareToFeedSelected: true,
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with multiple images (carousel)
  const mockCarouselPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Carousel post</p>',
    ingredients: [
      testId('ingredient', 2),
      testId('ingredient', 3),
      testId('ingredient', 4),
    ],
    isDeleted: false,
    organizationId: mockOrganizationId,
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
        InstagramPublisherService,
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
          provide: InstagramService,
          useValue: {
            postComment: vi.fn(),
            uploadCarousel: vi.fn(),
            uploadImage: vi.fn(),
            uploadReel: vi.fn(),
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

    service = module.get<InstagramPublisherService>(InstagramPublisherService);
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    instagramService = module.get(
      InstagramService,
    ) as vi.Mocked<InstagramService>;
    postsService = module.get(PostsService) as vi.Mocked<PostsService>;
  });

  describe('validatePost caption length', () => {
    const imageMediaInfo: MediaInfo = {
      hasIngredients: true,
      ingredientIds: [mockIngredientId],
      isCarousel: false,
      isImagePost: true,
      mediaUrls: [
        `https://api.test.com/ingredients/images/${mockIngredientId}`,
      ],
    };

    it('should fail an over-limit caption with a structured caption_too_long error', () => {
      const context = createPublishContext({
        ...mockImagePost,
        description: 'a'.repeat(2201),
      } as unknown as PostEntity);
      const result = service.validatePost(context, imageMediaInfo);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('caption_too_long');
      expect(result.error).toContain('Instagram');
      expect(result.error).toContain('2201');
      expect(result.error).toContain('2200');
    });
  });

  describe('publish', () => {
    describe('text-only posts (not supported)', () => {
      it('should return failed result for text-only posts', async () => {
        const context = createPublishContext(mockTextPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not support text-only posts');
        expect(result.executionState).toBe(TargetExecutionState.FAILED);
      });
    });

    describe('image posts', () => {
      it('should publish a single image successfully', async () => {
        const context = createPublishContext(mockImagePost);
        const mockMediaId = 'instagram-media-123';
        const mockShortcode = 'ABC123';

        instagramService.uploadImage.mockResolvedValue({
          mediaId: mockMediaId,
          shortcode: mockShortcode,
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockMediaId);
        expect(result.externalShortcode).toBe(mockShortcode);
        expect(result.platform).toBe(CredentialPlatform.INSTAGRAM);
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHED);
        expect(result.url).toContain(mockShortcode);
        expect(instagramService.uploadImage).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/images/'),
          expect.any(String),
          undefined,
          mockCredential.id,
        );
      });

      it('should handle HTML in description by converting to plain text', async () => {
        const postWithHtml = {
          ...mockImagePost,
          description: '<p>Hello <strong>world</strong></p>',
        };
        const context = createPublishContext(postWithHtml);

        instagramService.uploadImage.mockResolvedValue({
          mediaId: 'media-123',
          shortcode: 'ABC123',
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(instagramService.uploadImage).toHaveBeenCalled();
      });
    });

    describe('video posts (Reels)', () => {
      it('should publish a video as Reel successfully', async () => {
        const context = createPublishContext(mockVideoPost);
        const mockMediaId = 'instagram-reel-123';
        const mockShortcode = 'REEL123';

        instagramService.uploadReel.mockResolvedValue({
          mediaId: mockMediaId,
          shortcode: mockShortcode,
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockMediaId);
        expect(result.externalShortcode).toBe(mockShortcode);
        expect(instagramService.uploadReel).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/videos/'),
          expect.any(String),
          undefined, // coverImageUrl
          undefined, // hashtags
          true, // isShareToFeedSelected
          mockCredential.id,
        );
      });

      it('should suppress the feed copy when the placement is reel-only', async () => {
        // `placement: 'reel'` means reel-only, so keeping the feed copy would
        // publish twice and contradict what the composer selected.
        const context = createPublishContext(mockVideoPost, {
          placement: 'reel',
        });

        instagramService.uploadReel.mockResolvedValue({
          mediaId: 'reel-123',
          shortcode: 'REEL123',
        });

        await service.publish(context);

        expect(instagramService.uploadReel).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          undefined,
          undefined,
          false,
          mockCredential.id,
        );
      });
    });

    describe('carousel posts', () => {
      it('should publish a carousel with multiple images', async () => {
        const context = createPublishContext(mockCarouselPost);
        const mockMediaId = 'instagram-carousel-123';
        const mockShortcode = 'CAROUSEL123';

        instagramService.uploadCarousel.mockResolvedValue({
          mediaId: mockMediaId,
          shortcode: mockShortcode,
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockMediaId);
        expect(result.externalShortcode).toBe(mockShortcode);
        expect(instagramService.uploadCarousel).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.arrayContaining([expect.stringContaining('/images/')]),
          expect.any(String),
          undefined,
          mockCredential.id,
        );
      });
    });

    describe('error handling', () => {
      it('should return failed result when externalId is null', async () => {
        const context = createPublishContext(mockImagePost);

        instagramService.uploadImage.mockResolvedValue({
          mediaId: null as unknown as string,
          shortcode: null,
        });

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID');
      });

      it('should throw error when Instagram API fails', async () => {
        const context = createPublishContext(mockImagePost);
        const error = new Error('Instagram API error');

        instagramService.uploadImage.mockRejectedValue(error);

        await expect(service.publish(context)).rejects.toThrow(
          'Instagram API error',
        );
        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('publishThreadChildren', () => {
    const mockParentExternalId = 'parent-media-123';

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

    it('should post every child as a comment', async () => {
      const context = createPublishContext(mockImagePost);

      instagramService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        mockChildren,
        mockParentExternalId,
      );

      expect(instagramService.postComment).toHaveBeenCalledTimes(3);
      expect(postsService.patch).toHaveBeenCalledTimes(3);
    });

    it('should publish the text and drop media this channel refuses', async () => {
      const context = createPublishContext(mockImagePost);
      const mediaChildren = [
        {
          id: testId('child', 4),
          category: PostCategory.IMAGE,
          description: '<p>Image</p>',
          ingredients: [mockIngredientId],
          order: 1,
        },
      ];

      instagramService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        mediaChildren,
        mockParentExternalId,
      );

      expect(instagramService.postComment).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        mockParentExternalId,
        'Image',
        expect.anything(),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('comment media dropped by channel'),
        expect.any(Object),
      );
    });
  });

  describe('validation', () => {
    it('should fail validation for text-only posts', () => {
      const context = createPublishContext(mockTextPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      };

      const result = service['validatePost'](context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not support text-only posts');
    });

    it('should fail validation when a reel placement has an image', () => {
      // Instagram derives the container type from the media, so a reel
      // placement on an image used to publish to the feed without a word.
      const context = createPublishContext(mockImagePost, {
        placement: 'reel',
      });
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: true,
        mediaUrls: ['https://api.test.com/ingredients/images/123'],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('reels require a video');
    });
  });

  describe('logging', () => {
    it('should log error on publish failure', async () => {
      const context = createPublishContext(mockImagePost);
      const error = new Error('API failure');

      instagramService.uploadImage.mockRejectedValue(error);

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
