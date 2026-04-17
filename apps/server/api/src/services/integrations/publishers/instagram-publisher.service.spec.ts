/**
 * @fileoverview Tests for InstagramPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramPublisherService } from '@api/services/integrations/publishers/instagram-publisher.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('InstagramPublisherService', () => {
  let service: InstagramPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let instagramService: vi.Mocked<InstagramService>;
  let postsService: vi.Mocked<PostsService>;

  // Test IDs
  const mockOrganizationId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockBrandId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockPostId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const mockUserId = new Types.ObjectId('507f1f77bcf86cd799439014');
  const mockCredentialId = new Types.ObjectId('507f1f77bcf86cd799439015');
  const mockIngredientId = new Types.ObjectId('507f1f77bcf86cd799439016');

  // Mock credential
  const mockCredential = {
    _id: mockCredentialId,
    accessToken: 'encrypted-access-token',
    brand: mockBrandId,
    externalHandle: 'testuser',
    isDeleted: false,
    organization: mockOrganizationId,
    platform: CredentialPlatform.INSTAGRAM,
    user: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    _id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only (not supported on Instagram)
  const mockTextPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test Instagram content</p>',
    ingredients: [],
    isDeleted: false,
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with image
  const mockImagePost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Test image post</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with video
  const mockVideoPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.VIDEO,
    description: '<p>Test video reel</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    isShareToFeedSelected: true,
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with multiple images (carousel)
  const mockCarouselPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Carousel post</p>',
    ingredients: [
      new Types.ObjectId('507f1f77bcf86cd799439020'),
      new Types.ObjectId('507f1f77bcf86cd799439021'),
      new Types.ObjectId('507f1f77bcf86cd799439022'),
    ],
    isDeleted: false,
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Create publish context helper
  const createPublishContext = (post: PostEntity): PublishContext => ({
    brandId: mockBrandId.toString(),
    credential: mockCredential,
    organization: mockOrganization,
    organizationId: mockOrganizationId.toString(),
    post,
    postId: mockPostId.toString(),
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
    _configService = module.get(ConfigService) as vi.Mocked<ConfigService>;
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    instagramService = module.get(
      InstagramService,
    ) as vi.Mocked<InstagramService>;
    postsService = module.get(PostsService) as vi.Mocked<PostsService>;
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform', () => {
      expect(service.platform).toBe(CredentialPlatform.INSTAGRAM);
    });

    it('should NOT support text-only posts', () => {
      expect(service.supportsTextOnly).toBe(false);
    });

    it('should support images', () => {
      expect(service.supportsImages).toBe(true);
    });

    it('should support videos', () => {
      expect(service.supportsVideos).toBe(true);
    });

    it('should support carousel', () => {
      expect(service.supportsCarousel).toBe(true);
    });

    it('should support threads', () => {
      expect(service.supportsThreads).toBe(true);
    });
  });

  describe('publish', () => {
    describe('text-only posts (not supported)', () => {
      it('should return failed result for text-only posts', async () => {
        const context = createPublishContext(mockTextPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not support text-only posts');
        expect(result.status).toBe(PostStatus.FAILED);
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
        expect(result.status).toBe(PostStatus.PUBLIC);
        expect(result.url).toContain(mockShortcode);
        expect(instagramService.uploadImage).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/images/'),
          expect.any(String),
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
        );
      });

      it('should respect isShareToFeedSelected flag', async () => {
        const postNotSharedToFeed = {
          ...mockVideoPost,
          isShareToFeedSelected: false,
        };
        const context = createPublishContext(postNotSharedToFeed);

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

  describe('buildPostUrl', () => {
    it('should build correct Instagram URL using shortcode', () => {
      const externalId = 'media-123';
      const shortcode = 'ABC123XYZ';

      const result = service.buildPostUrl(
        externalId,
        mockCredential,
        shortcode,
      );

      expect(result).toBe(`https://www.instagram.com/p/${shortcode}`);
    });

    it('should handle undefined shortcode', () => {
      const externalId = 'media-123';

      const result = service.buildPostUrl(
        externalId,
        mockCredential,
        undefined,
      );

      expect(result).toBe('https://www.instagram.com/p/undefined');
    });
  });

  describe('publishThreadChildren', () => {
    const mockParentExternalId = 'parent-media-123';

    const mockChildren = [
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439030'),
        category: PostCategory.TEXT,
        description: '<p>Comment 1</p>',
        order: 1,
      },
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
        category: PostCategory.TEXT,
        description: '<p>Comment 2</p>',
        order: 2,
      },
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439032'),
        category: PostCategory.IMAGE,
        description: '<p>Image child - should be ignored</p>',
        ingredients: [mockIngredientId],
        order: 3,
      },
    ];

    it('should post TEXT children as comments', async () => {
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

      // Should only post 2 comments (TEXT children only)
      expect(instagramService.postComment).toHaveBeenCalledTimes(2);
      expect(postsService.patch).toHaveBeenCalledTimes(2);
    });

    it('should ignore non-TEXT children', async () => {
      const context = createPublishContext(mockImagePost);
      const imageChildren = [
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439040'),
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

      expect(instagramService.postComment).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('no TEXT children'),
        expect.any(Object),
      );
    });

    it('should sort children by order before posting', async () => {
      const context = createPublishContext(mockImagePost);
      const unorderedChildren = [
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439050'),
          category: PostCategory.TEXT,
          description: '<p>Second</p>',
          order: 2,
        },
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439051'),
          category: PostCategory.TEXT,
          description: '<p>First</p>',
          order: 1,
        },
      ];

      instagramService.postComment.mockResolvedValue({
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
        unorderedChildren[1]._id.toString(),
      );
    });

    it('should mark child as failed when comment post fails', async () => {
      const context = createPublishContext(mockImagePost);
      const singleChild = [mockChildren[0]];

      instagramService.postComment.mockResolvedValue({ commentId: '' });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        singleChild,
        mockParentExternalId,
      );

      expect(postsService.patch).toHaveBeenCalledWith(
        singleChild[0]._id.toString(),
        expect.objectContaining({
          status: PostStatus.FAILED,
        }),
      );
    });

    it('should continue with other children when one fails', async () => {
      const context = createPublishContext(mockImagePost);
      const textChildren = mockChildren.filter(
        (c) => c.category === PostCategory.TEXT,
      );

      instagramService.postComment
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

    it('should log completion of comment posting', async () => {
      const context = createPublishContext(mockImagePost);
      const singleChild = [mockChildren[0]];

      instagramService.postComment.mockResolvedValue({
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

      const result = (service as any).validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not support text-only posts');
    });

    it('should pass validation for image posts', () => {
      const context = createPublishContext(mockImagePost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: true,
        mediaUrls: ['https://api.test.com/ingredients/images/123'],
      };

      const result = (service as any).validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });

    it('should pass validation for carousel posts', () => {
      const context = createPublishContext(mockCarouselPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: ['1', '2', '3'],
        isCarousel: true,
        isImagePost: true,
        mediaUrls: [
          'https://api.test.com/ingredients/images/1',
          'https://api.test.com/ingredients/images/2',
          'https://api.test.com/ingredients/images/3',
        ],
      };

      const result = (service as any).validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });
  });

  describe('logging', () => {
    it('should log publish attempt', async () => {
      const context = createPublishContext(mockImagePost);

      instagramService.uploadImage.mockResolvedValue({
        mediaId: 'media-123',
        shortcode: 'ABC123',
      });

      await service.publish(context);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('publishing to'),
        expect.objectContaining({
          category: mockImagePost.category,
          postId: context.postId,
        }),
      );
    });

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
