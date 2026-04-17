/**
 * @fileoverview Tests for PinterestPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PinterestPublisherService } from '@api/services/integrations/publishers/pinterest-publisher.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PinterestPublisherService', () => {
  let service: PinterestPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let pinterestService: vi.Mocked<PinterestService>;
  let credentialsService: vi.Mocked<CredentialsService>;

  // Test IDs
  const mockOrganizationId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockBrandId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockPostId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const mockUserId = new Types.ObjectId('507f1f77bcf86cd799439014');
  const mockCredentialId = new Types.ObjectId('507f1f77bcf86cd799439015');
  const mockIngredientId = new Types.ObjectId('507f1f77bcf86cd799439016');
  const mockBoardId = 'board-123456789';

  // Mock credential
  const mockCredential = {
    _id: mockCredentialId,
    accessToken: 'encrypted-access-token',
    brand: mockBrandId,
    externalHandle: 'testuser',
    externalId: mockBoardId,
    isDeleted: false,
    organization: mockOrganizationId,
    platform: CredentialPlatform.PINTEREST,
    user: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    _id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only (not supported on Pinterest)
  const _mockTextPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test Pinterest content</p>',
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
    label: 'Pin Title',
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with video (not supported on Pinterest)
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

  // Mock post with multiple images (carousel - not supported)
  const mockCarouselPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Carousel post</p>',
    ingredients: [
      new Types.ObjectId('507f1f77bcf86cd799439020'),
      new Types.ObjectId('507f1f77bcf86cd799439021'),
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
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
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
    credentialsService = module.get(
      CredentialsService,
    ) as vi.Mocked<CredentialsService>;
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

  describe('publish', () => {
    beforeEach(() => {
      credentialsService.findOne.mockResolvedValue(
        mockCredential as unknown as CredentialEntity,
      );
    });

    describe('image posts', () => {
      it('should publish a single image successfully', async () => {
        const context = createPublishContext(mockImagePost);
        const mockPinId = 'pin-123456789';

        pinterestService.createPin.mockResolvedValue(mockPinId);

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPinId);
        expect(result.platform).toBe(CredentialPlatform.PINTEREST);
        expect(result.status).toBe(PostStatus.PUBLIC);
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
        const postWithoutLabel = { ...mockImagePost, label: undefined };
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

    describe('video posts (not supported)', () => {
      it('should return failed result for video posts', async () => {
        const context = createPublishContext(mockVideoPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest only supports image posts');
        expect(result.status).toBe(PostStatus.FAILED);
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
      it('should return failed result when credential not found', async () => {
        const context = createPublishContext(mockImagePost);

        credentialsService.findOne.mockResolvedValue(null);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest credential or board ID not found');
      });

      it('should return failed result when credential has no access token', async () => {
        const context = createPublishContext(mockImagePost);

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          accessToken: null,
        } as unknown as CredentialEntity);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Pinterest credential or board ID not found');
      });

      it('should return failed result when credential has no board ID', async () => {
        const context = createPublishContext(mockImagePost);

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          externalId: null,
        } as unknown as PostEntity);

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
        mockCredential as unknown as CredentialEntity,
      );

      expect(result).toBe(`https://www.pinterest.com/pin/${externalId}`);
    });
  });

  describe('logging', () => {
    beforeEach(() => {
      credentialsService.findOne.mockResolvedValue(
        mockCredential as unknown as CredentialEntity,
      );
    });

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
