/**
 * @fileoverview Tests for TikTokPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { TikTokPublisherService } from '@api/services/integrations/publishers/tiktok-publisher.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TikTokPublisherService', () => {
  let service: TikTokPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let tiktokService: vi.Mocked<TiktokService>;

  // Test IDs
  const mockOrganizationId = '507f1f77bcf86cd799439011';
  const mockBrandId = '507f1f77bcf86cd799439012';
  const mockPostId = '507f1f77bcf86cd799439013';
  const mockUserId = '507f1f77bcf86cd799439014';
  const mockCredentialId = '507f1f77bcf86cd799439015';
  const mockIngredientId = '507f1f77bcf86cd799439016';

  // Mock credential
  const mockCredential = {
    _id: mockCredentialId,
    accessToken: 'encrypted-access-token',
    brand: mockBrandId,
    externalHandle: 'testcreator',
    externalId: 'tiktok-user-123',
    isDeleted: false,
    organization: mockOrganizationId,
    platform: CredentialPlatform.TIKTOK,
    refreshToken: 'encrypted-refresh-token',
    user: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    _id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only (not supported on TikTok)
  const mockTextPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test TikTok content</p>',
    ingredients: [],
    isDeleted: false,
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with single image (not supported - needs 2-35 for carousel)
  const mockSingleImagePost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Single image post</p>',
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
    description: '<p>Test video post</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with carousel (2-35 images - supported on TikTok)
  const mockCarouselPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Photo carousel</p>',
    ingredients: [
      '507f1f77bcf86cd799439020',
      '507f1f77bcf86cd799439021',
      '507f1f77bcf86cd799439022',
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
        TikTokPublisherService,
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
          provide: TiktokService,
          useValue: {
            uploadImage: vi.fn(),
            uploadVideo: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TikTokPublisherService>(TikTokPublisherService);
    _configService = module.get(ConfigService) as vi.Mocked<ConfigService>;
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    tiktokService = module.get(TiktokService) as vi.Mocked<TiktokService>;
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform', () => {
      expect(service.platform).toBe(CredentialPlatform.TIKTOK);
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

    it('should NOT support threads', () => {
      expect(service.supportsThreads).toBe(false);
    });
  });

  describe('validatePost', () => {
    it('should fail validation for text-only posts', () => {
      const context = createPublishContext(mockTextPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not support text-only posts');
    });

    it('should fail validation for single image posts (needs carousel)', () => {
      const context = createPublishContext(mockSingleImagePost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: true,
        mediaUrls: ['https://api.test.com/ingredients/images/123'],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'TikTok requires 2-35 images for photo posts (carousel mode)',
      );
    });

    it('should pass validation for carousel posts (2-35 images)', () => {
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

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });

    it('should pass validation for video posts', () => {
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

  describe('publish', () => {
    describe('video posts', () => {
      it('should publish a video successfully with immediate post_id', async () => {
        const context = createPublishContext(mockVideoPost);
        const mockPostIdResult = 'tiktok-video-123456';

        tiktokService.uploadVideo.mockResolvedValue({
          data: {
            isPending: false,
            post_id: mockPostIdResult,
          },
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPostIdResult);
        expect(result.platform).toBe(CredentialPlatform.TIKTOK);
        expect(result.status).toBe(PostStatus.PUBLIC);
        expect(result.url).toBe(
          `https://www.tiktok.com/@${mockCredential.externalHandle}/video/${mockPostIdResult}`,
        );
        expect(tiktokService.uploadVideo).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/videos/'),
          mockVideoPost,
        );
      });

      it('should handle pending state with publish_id', async () => {
        const context = createPublishContext(mockVideoPost);
        const mockPublishId = 'publish-pending-123';

        tiktokService.uploadVideo.mockResolvedValue({
          data: {
            isPending: true,
            post_id: null,
            publish_id: mockPublishId,
          },
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPublishId);
        expect(result.status).toBe(PostStatus.PENDING);
        expect(result.url).toBe('');
      });

      it('should handle pending state without post_id but with publish_id', async () => {
        const context = createPublishContext(mockVideoPost);
        const mockPublishId = 'publish-123';

        tiktokService.uploadVideo.mockResolvedValue({
          data: {
            publish_id: mockPublishId,
          },
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPublishId);
        expect(result.status).toBe(PostStatus.PENDING);
      });
    });

    describe('carousel posts (photo posts)', () => {
      it('should publish a photo carousel successfully', async () => {
        const context = createPublishContext(mockCarouselPost);
        const mockPostIdResult = 'tiktok-carousel-123456';

        tiktokService.uploadImage.mockResolvedValue({
          data: {
            isPending: false,
            post_id: mockPostIdResult,
          },
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPostIdResult);
        expect(result.platform).toBe(CredentialPlatform.TIKTOK);
        expect(tiktokService.uploadImage).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.arrayContaining([expect.stringContaining('/images/')]),
          mockCarouselPost,
          undefined,
        );
      });

      it('should pass isDraft flag to uploadImage when context has isDraft', async () => {
        const context = {
          ...createPublishContext(mockCarouselPost),
          isDraft: true,
        };
        const mockPostIdResult = 'tiktok-draft-carousel-123';

        tiktokService.uploadImage.mockResolvedValue({
          data: {
            isPending: false,
            post_id: mockPostIdResult,
          },
        });

        await service.publish(context);

        expect(tiktokService.uploadImage).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.arrayContaining([expect.stringContaining('/images/')]),
          mockCarouselPost,
          true,
        );
      });

      it('should handle pending state for carousel', async () => {
        const context = createPublishContext(mockCarouselPost);
        const mockPublishId = 'carousel-publish-123';

        tiktokService.uploadImage.mockResolvedValue({
          data: {
            isPending: true,
            publish_id: mockPublishId,
          },
        });

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPublishId);
        expect(result.status).toBe(PostStatus.PENDING);
      });
    });

    describe('single image posts (not supported)', () => {
      it('should return failed result for single image posts', async () => {
        const context = createPublishContext(mockSingleImagePost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe(
          'TikTok requires 2-35 images for photo posts (carousel mode)',
        );
        expect(result.status).toBe(PostStatus.FAILED);
      });
    });

    describe('text-only posts (not supported)', () => {
      it('should return failed result for text-only posts', async () => {
        const context = createPublishContext(mockTextPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not support text-only posts');
        expect(result.status).toBe(PostStatus.FAILED);
      });
    });

    describe('error handling', () => {
      it('should return failed result when no post_id or publish_id returned', async () => {
        const context = createPublishContext(mockVideoPost);

        tiktokService.uploadVideo.mockResolvedValue({
          data: {},
        });

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID or publish ID');
      });

      it('should throw error when TikTok API fails', async () => {
        const context = createPublishContext(mockVideoPost);
        const error = new Error('TikTok API error');

        tiktokService.uploadVideo.mockRejectedValue(error);

        await expect(service.publish(context)).rejects.toThrow(
          'TikTok API error',
        );
        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct TikTok URL', () => {
      const externalId = 'video-123456789';

      const result = service.buildPostUrl(
        externalId,
        mockCredential as unknown as CredentialEntity,
      );

      expect(result).toBe(
        `https://www.tiktok.com/@${mockCredential.externalHandle}/video/${externalId}`,
      );
    });
  });

  describe('logging', () => {
    it('should log publish attempt', async () => {
      const context = createPublishContext(mockVideoPost);

      tiktokService.uploadVideo.mockResolvedValue({
        data: { post_id: 'video-123' },
      });

      await service.publish(context);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('publishing to'),
        expect.objectContaining({
          category: mockVideoPost.category,
          postId: context.postId,
        }),
      );
    });

    it('should log pending state', async () => {
      const context = createPublishContext(mockVideoPost);

      tiktokService.uploadVideo.mockResolvedValue({
        data: { isPending: true, publish_id: 'publish-123' },
      });

      await service.publish(context);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('awaiting TikTok verification'),
        expect.objectContaining({
          postId: context.postId,
          publishId: 'publish-123',
        }),
      );
    });

    it('should log error on publish failure', async () => {
      const context = createPublishContext(mockVideoPost);
      const error = new Error('API failure');

      tiktokService.uploadVideo.mockRejectedValue(error);

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
