/**
 * @fileoverview Tests for PinterestPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PinterestPublisherService } from '@api/services/integrations/publishers/pinterest-publisher.service';
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
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Test, TestingModule } from '@nestjs/testing';

describe('PinterestPublisherService', () => {
  let service: PinterestPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let pinterestService: vi.Mocked<PinterestService>;

  // Test IDs
  const mockOrganizationId = testId('org');
  const mockBrandId = testId('brand');
  const mockPostId = testId('post');
  const mockUserId = testId('user');
  const mockCredentialId = testId('credential');
  const mockIngredientId = testId('ingredient');
  const mockBoardId = 'board-123456789';

  // Mock credential
  const mockCredential = {
    id: mockCredentialId,
    accessToken: 'encrypted-access-token',
    brandId: mockBrandId,
    externalHandle: 'testuser',
    externalId: mockBoardId,
    isDeleted: false,
    organizationId: mockOrganizationId,
    platform: CredentialPlatform.PINTEREST,
    userId: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only (not supported on Pinterest)
  const _mockTextPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test Pinterest content</p>',
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
    label: 'Pin Title',
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Mock post with video (not supported on Pinterest)
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

  // Mock post with multiple images (carousel - not supported)
  const mockCarouselPost = {
    id: mockPostId,
    brandId: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Carousel post</p>',
    ingredients: [testId('ingredient', 2), testId('ingredient', 3)],
    isDeleted: false,
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

  // Create publish context helper
  const createPublishContext = (
    post: PostEntity,
    settings: ChannelTargetSettings = {},
    credential: CredentialDocument = mockCredential,
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

    // Mock EncryptionUtil
    vi.spyOn(EncryptionUtil, 'decrypt').mockImplementation((value) => {
      return `decrypted-${value}`;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PinterestPublisherService,
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
          provide: PinterestService,
          useValue: {
            createPin: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PinterestPublisherService>(PinterestPublisherService);
    _configService = module.get(ConfigService) as vi.Mocked<ConfigService>;
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    pinterestService = module.get(
      PinterestService,
    ) as vi.Mocked<PinterestService>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform', () => {
      expect(service.platform).toBe(CredentialPlatform.PINTEREST);
    });

    it('should NOT support text-only posts', () => {
      expect(service.supportsTextOnly).toBe(false);
    });

    it('should support images', () => {
      expect(service.supportsImages).toBe(true);
    });

    it('should NOT support videos', () => {
      expect(service.supportsVideos).toBe(false);
    });

    it('should NOT support carousel', () => {
      expect(service.supportsCarousel).toBe(false);
    });

    it('should NOT support threads', () => {
      expect(service.supportsThreads).toBe(false);
    });
  });

  describe('validatePost', () => {
    it('should fail validation for non-image posts', () => {
      const context = createPublishContext(mockVideoPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: ['https://api.test.com/ingredients/videos/123'],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Pinterest only supports image posts');
    });

    it('should fail validation for carousel posts', () => {
      const context = createPublishContext(mockCarouselPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: ['1', '2'],
        isCarousel: true,
        isImagePost: true,
        mediaUrls: [
          'https://api.test.com/ingredients/images/1',
          'https://api.test.com/ingredients/images/2',
        ],
      };

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Pinterest does not support carousel posts');
    });

    it('should pass validation for single image posts', () => {
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
    const imageMediaInfo: MediaInfo = {
      hasIngredients: true,
      ingredientIds: [mockIngredientId],
      isCarousel: false,
      isImagePost: true,
      mediaUrls: [
        `https://api.test.com/ingredients/images/${mockIngredientId}`,
      ],
    };

    it('should pass a description exactly at the 500-character Pinterest limit', () => {
      const context = createPublishContext({
        ...mockImagePost,
        description: 'a'.repeat(500),
      } as unknown as PostEntity);
      const result = service.validatePost(context, imageMediaInfo);
      expect(result.valid).toBe(true);
    });

    it('should fail an over-limit description with a structured caption_too_long error', () => {
      const context = createPublishContext({
        ...mockImagePost,
        description: 'a'.repeat(501),
      } as unknown as PostEntity);
      const result = service.validatePost(context, imageMediaInfo);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('caption_too_long');
      expect(result.error).toContain('Pinterest');
      expect(result.error).toContain('501');
      expect(result.error).toContain('500');
    });
  });

  describe('publish', () => {
    describe('image posts', () => {
      it('should publish a single image successfully', async () => {
        const context = createPublishContext(mockImagePost);
        const mockPinId = 'pin-123456789';

        pinterestService.createPin.mockResolvedValue(mockPinId);

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPinId);
        expect(result.platform).toBe(CredentialPlatform.PINTEREST);
        expect(result.executionState).toBe(TargetExecutionState.PUBLISHED);
        expect(result.url).toBe(`https://www.pinterest.com/pin/${mockPinId}`);
        expect(pinterestService.createPin).toHaveBeenCalledWith(
          expect.stringContaining('decrypted-'),
          mockBoardId,
          expect.stringContaining('/images/'),
          mockImagePost.label,
          expect.any(String),
          undefined,
        );
      });

      it('should handle post without label', async () => {
        const postWithoutLabel = {
          ...mockImagePost,
          // Simulates a legacy row persisted before `label` became a
          // required PostEntity field; the service still falls back to
          // "Untitled" for these at runtime.
          label: undefined as unknown as string,
        };
        const context = createPublishContext(postWithoutLabel);

        pinterestService.createPin.mockResolvedValue('pin-123');

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(pinterestService.createPin).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'Untitled',
          expect.any(String),
          undefined,
        );
      });

      it('should handle HTML in description by converting to plain text', async () => {
        const postWithHtml = {
          ...mockImagePost,
          description: '<p>Hello <strong>world</strong></p>',
        };
        const context = createPublishContext(postWithHtml);

        pinterestService.createPin.mockResolvedValue('pin-123');

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(pinterestService.createPin).toHaveBeenCalled();
      });
    });

    describe('channel target settings', () => {
      it('should pin to the board named by the setting', async () => {
        // One credential covers every board on the account, so the per-target
        // setting decides where the pin lands.
        pinterestService.createPin.mockResolvedValue('pin-1');

        await service.publish(
          createPublishContext(mockImagePost, { boardId: 'board-987654321' }),
        );

        expect(pinterestService.createPin).toHaveBeenCalledWith(
          expect.any(String),
          'board-987654321',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          undefined,
        );
      });

      it('should fall back to the credential board when unset', async () => {
        // Releases scheduled before the setting existed carry no settings.
        pinterestService.createPin.mockResolvedValue('pin-1');

        await service.publish(createPublishContext(mockImagePost));

        expect(pinterestService.createPin).toHaveBeenCalledWith(
          expect.any(String),
          mockBoardId,
          expect.any(String),
          expect.any(String),
          expect.any(String),
          undefined,
        );
      });
    });

    describe('video posts (not supported)', () => {
      it('should return failed result for video posts', async () => {
        const context = createPublishContext(mockVideoPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest only supports image posts');
        expect(result.executionState).toBe(TargetExecutionState.FAILED);
      });
    });

    describe('carousel posts (not supported)', () => {
      it('should return failed result for carousel posts', async () => {
        const context = createPublishContext(mockCarouselPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest does not support carousel posts');
      });
    });

    describe('credential handling', () => {
      it('should pin as the account on the context, not a sibling account', async () => {
        // A brand with two Pinterest accounts must pin to the board of the
        // account the post was scheduled for.
        const secondAccount = {
          ...mockCredential,
          id: testId('credential-2'),
          accessToken: 'encrypted-access-token-2',
          externalId: 'board-987654321',
        } as unknown as CredentialDocument;

        pinterestService.createPin.mockResolvedValue('pin-1');

        await service.publish(
          createPublishContext(mockImagePost, {}, secondAccount),
        );

        expect(pinterestService.createPin).toHaveBeenCalledWith(
          'decrypted-encrypted-access-token-2',
          'board-987654321',
          expect.any(String),
          expect.any(String),
          expect.any(String),
          undefined,
        );
      });

      it('should return failed result when credential not found', async () => {
        const context = {
          ...createPublishContext(mockImagePost),
          credential: undefined as unknown as CredentialDocument,
        };

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest credential or board ID not found');
      });

      it('should return failed result when credential has no access token', async () => {
        const context = createPublishContext(mockImagePost, {}, {
          ...mockCredential,
          accessToken: null,
        } as unknown as CredentialDocument);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest credential or board ID not found');
      });

      it('should return failed result when credential has no board ID', async () => {
        const context = createPublishContext(mockImagePost, {}, {
          ...mockCredential,
          externalId: null,
        } as unknown as CredentialDocument);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest credential or board ID not found');
      });
    });

    describe('error handling', () => {
      it('should return failed result when externalId is null', async () => {
        const context = createPublishContext(mockImagePost);

        pinterestService.createPin.mockResolvedValue(null as unknown as string);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID');
      });

      it('should throw error when Pinterest API fails', async () => {
        const context = createPublishContext(mockImagePost);
        const error = new Error('Pinterest API error');

        pinterestService.createPin.mockRejectedValue(error);

        await expect(service.publish(context)).rejects.toThrow(
          'Pinterest API error',
        );
        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct Pinterest URL', () => {
      const externalId = 'pin-123456789';

      const result = service.buildPostUrl(
        externalId,
        mockCredential as unknown as CredentialDocument,
      );

      expect(result).toBe(`https://www.pinterest.com/pin/${externalId}`);
    });
  });

  describe('logging', () => {
    it('should log publish attempt', async () => {
      const context = createPublishContext(mockImagePost);

      pinterestService.createPin.mockResolvedValue('pin-123');

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

      pinterestService.createPin.mockRejectedValue(error);

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
