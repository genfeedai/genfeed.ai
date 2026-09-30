/**
 * @fileoverview Tests for TikTokPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { TIKTOK_APP_HANDOFF_SETTING } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { TikTokPublisherService } from '@api/services/integrations/publishers/tiktok-publisher.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
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

describe('TikTokPublisherService', () => {
  let service: TikTokPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let tiktokService: vi.Mocked<TiktokService>;

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
    externalHandle: 'testcreator',
    externalId: 'tiktok-user-123',
    isDeleted: false,
    organizationId: mockOrganizationId,
    platform: CredentialPlatform.TIKTOK,
    refreshToken: 'encrypted-refresh-token',
    userId: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only (not supported on TikTok)
  const mockTextPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test TikTok content</p>',
    ingredients: [],
    isDeleted: false,
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with single image (not supported - needs 2-35 for carousel)
  const mockSingleImagePost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Single image post</p>',
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
    description: '<p>Test video post</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with carousel (2-35 images - supported on TikTok)
  const mockCarouselPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Photo carousel</p>',
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
            uploadVideoToInbox: vi.fn(),
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

  describe('validatePost caption length', () => {
    const videoMediaInfo: MediaInfo = {
      hasIngredients: true,
      ingredientIds: [mockIngredientId],
      isCarousel: false,
      isImagePost: false,
      mediaUrls: [
        `https://api.test.com/ingredients/videos/${mockIngredientId}`,
      ],
    };

    it('should pass a caption exactly at the 2200-character TikTok limit', () => {
      const context = createPublishContext({
        ...mockVideoPost,
        description: 'a'.repeat(2200),
      } as unknown as PostEntity);
      const result = service.validatePost(context, videoMediaInfo);
      expect(result.valid).toBe(true);
    });

    it('should fail an over-limit caption with a structured caption_too_long error', () => {
      const context = createPublishContext({
        ...mockVideoPost,
        description: 'a'.repeat(2201),
      } as unknown as PostEntity);
      const result = service.validatePost(context, videoMediaInfo);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('caption_too_long');
      expect(result.error).toContain('TikTok');
      expect(result.error).toContain('2201');
      expect(result.error).toContain('2200');
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
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHED);
        expect(result.url).toBe(
          `https://www.tiktok.com/@${mockCredential.externalHandle}/video/${mockPostIdResult}`,
        );
        expect(tiktokService.uploadVideo).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/videos/'),
          mockVideoPost,
          {},
          mockCredential.id,
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
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
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
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
      });

      it('hands the video to the TikTok app and keeps it pending until the user posts', async () => {
        const context = createPublishContext(mockVideoPost, {
          [TIKTOK_APP_HANDOFF_SETTING]: true,
        });
        tiktokService.uploadVideoToInbox.mockResolvedValue({
          data: { publish_id: 'v_inbox_file~123' },
        });

        const result = await service.publish(context);

        expect(tiktokService.uploadVideoToInbox).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/videos/'),
          mockCredential.id,
        );
        expect(tiktokService.uploadVideo).not.toHaveBeenCalled();
        expect(result).toEqual({
          executionState: TargetExecutionState.PUBLISHING,
          externalId: 'v_inbox_file~123',
          platform: CredentialPlatform.TIKTOK,
          success: true,
          url: '',
        });
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
          {},
          mockCredential.id,
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
          {},
          mockCredential.id,
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
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
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
        expect(result.executionState).toBe(TargetExecutionState.FAILED);
      });
    });

    describe('text-only posts (not supported)', () => {
      it('should return failed result for text-only posts', async () => {
        const context = createPublishContext(mockTextPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not support text-only posts');
        expect(result.executionState).toBe(TargetExecutionState.FAILED);
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
