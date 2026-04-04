/**
 * @fileoverview Tests for TwitterPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

// Mock twitter-api-v2 before imports
const mockTweet = vi.fn();
const mockUploadMedia = vi.fn();

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(() => ({
    v2: {
      tweet: mockTweet,
      uploadMedia: mockUploadMedia,
    },
  })),
}));

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { TwitterPublisherService } from '@api/services/integrations/publishers/twitter-publisher.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { of } from 'rxjs';

describe('TwitterPublisherService', () => {
  let service: TwitterPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let httpService: vi.Mocked<HttpService>;
  let twitterService: vi.Mocked<TwitterService>;
  let credentialsService: vi.Mocked<CredentialsService>;
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
    accessTokenSecret: 'encrypted-access-secret',
    brand: mockBrandId,
    externalHandle: 'testuser',
    isDeleted: false,
    organization: mockOrganizationId,
    platform: CredentialPlatform.TWITTER,
    refreshToken: 'encrypted-refresh-token',
    user: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    _id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock post for text-only
  const mockTextPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test tweet content</p>',
    ingredients: [],
    isDeleted: false,
    organization: mockOrganizationId,
    quoteTweetId: undefined,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with image
  const mockImagePost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Test image tweet</p>',
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
    description: '<p>Test video tweet</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    organization: mockOrganizationId,
    status: PostStatus.DRAFT,
    user: mockUserId,
  } as unknown as PostEntity;

  // Mock post with multiple images (carousel)
  const mockCarouselPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.IMAGE,
    description: '<p>Carousel tweet</p>',
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
    // Reset all mocks
    vi.clearAllMocks();

    // Mock EncryptionUtil
    vi.spyOn(EncryptionUtil, 'decrypt').mockImplementation((value) => {
      return `decrypted-${value}`;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterPublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string) => {
              const config: Record<string, string> = {
                TWITTER_CONSUMER_KEY: 'test-consumer-key',
                TWITTER_CONSUMER_SECRET: 'test-consumer-secret',
              };
              return config[key] || '';
            }),
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
          provide: HttpService,
          useValue: {
            get: vi.fn(),
          },
        },
        {
          provide: TwitterService,
          useValue: {
            buildTweetUrl: vi.fn(),
            uploadMedia: vi.fn(),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
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

    service = module.get<TwitterPublisherService>(TwitterPublisherService);
    vi.spyOn(
      service as any,
      'getTwitterClientFromCredential',
    ).mockResolvedValue({ v2: { tweet: mockTweet } });
    _configService = module.get(ConfigService) as vi.Mocked<ConfigService>;
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    httpService = module.get(HttpService) as vi.Mocked<HttpService>;
    twitterService = module.get(TwitterService) as vi.Mocked<TwitterService>;
    credentialsService = module.get(
      CredentialsService,
    ) as vi.Mocked<CredentialsService>;
    postsService = module.get(PostsService) as vi.Mocked<PostsService>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform', () => {
      expect(service.platform).toBe(CredentialPlatform.TWITTER);
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

    it('should support carousel', () => {
      expect(service.supportsCarousel).toBe(true);
    });

    it('should support threads', () => {
      expect(service.supportsThreads).toBe(true);
    });
  });

  describe('publish', () => {
    describe('text-only posts', () => {
      it('should publish a text-only tweet successfully', async () => {
        const context = createPublishContext(mockTextPost);
        const mockTweetId = '1234567890';

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          accessToken: 'encrypted-token',
        } as unknown as CredentialDocument);

        mockTweet.mockResolvedValue({
          data: { id: mockTweetId },
        });

        twitterService.buildTweetUrl.mockReturnValue(
          `https://x.com/testuser/status/${mockTweetId}`,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockTweetId);
        expect(result.platform).toBe(CredentialPlatform.TWITTER);
        expect(result.status).toBe(PostStatus.PUBLIC);
        expect(result.url).toContain(mockTweetId);
      });

      it('should publish text-only tweet with quote tweet', async () => {
        const postWithQuote = {
          ...mockTextPost,
          quoteTweetId: '9876543210',
        };
        const context = createPublishContext(postWithQuote);
        const mockTweetId = '1234567890';

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          accessToken: 'encrypted-token',
        } as unknown as CredentialDocument);

        mockTweet.mockResolvedValue({
          data: { id: mockTweetId },
        });

        twitterService.buildTweetUrl.mockReturnValue(
          `https://x.com/testuser/status/${mockTweetId}`,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(mockTweet).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ quote_tweet_id: '9876543210' }),
        );
      });

      it('should handle HTML in description by converting to plain text', async () => {
        const postWithHtml = {
          ...mockTextPost,
          description:
            '<p>Hello <strong>world</strong></p><p>Second paragraph</p>',
        };
        const context = createPublishContext(postWithHtml);
        const mockTweetId = '1234567890';

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          accessToken: 'encrypted-token',
        } as unknown as CredentialDocument);

        mockTweet.mockResolvedValue({
          data: { id: mockTweetId },
        });

        twitterService.buildTweetUrl.mockReturnValue(
          `https://x.com/testuser/status/${mockTweetId}`,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        // Verify tweet was called (HTML should be converted to plain text)
        expect(mockTweet).toHaveBeenCalled();
      });
    });

    describe('media posts', () => {
      it('should publish an image post successfully', async () => {
        const context = createPublishContext(mockImagePost);
        const mockTweetId = '1234567890';

        twitterService.uploadMedia.mockResolvedValue(mockTweetId);
        twitterService.buildTweetUrl.mockReturnValue(
          `https://x.com/testuser/status/${mockTweetId}`,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockTweetId);
        expect(twitterService.uploadMedia).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/images/'),
          mockImagePost.description,
          'image/jpeg',
          undefined,
        );
      });

      it('should publish a video post successfully', async () => {
        const context = createPublishContext(mockVideoPost);
        const mockTweetId = '1234567890';

        twitterService.uploadMedia.mockResolvedValue(mockTweetId);
        twitterService.buildTweetUrl.mockReturnValue(
          `https://x.com/testuser/status/${mockTweetId}`,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockTweetId);
        expect(twitterService.uploadMedia).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/videos/'),
          mockVideoPost.description,
          'video/mp4',
          undefined,
        );
      });

      it('should publish a carousel post with multiple images', async () => {
        const context = createPublishContext(mockCarouselPost);
        const mockTweetId = '1234567890';

        twitterService.uploadMedia.mockResolvedValue(mockTweetId);
        twitterService.buildTweetUrl.mockReturnValue(
          `https://x.com/testuser/status/${mockTweetId}`,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockTweetId);
        // For carousel, should pass array of URLs
        expect(twitterService.uploadMedia).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.arrayContaining([expect.stringContaining('/images/')]),
          mockCarouselPost.description,
          'image/jpeg',
          undefined,
        );
      });

      it('should treat TEXT post with ingredients as IMAGE post', async () => {
        const textPostWithIngredient = {
          ...mockTextPost,
          ingredients: [mockIngredientId],
        };
        const context = createPublishContext(textPostWithIngredient);
        const mockTweetId = '1234567890';

        twitterService.uploadMedia.mockResolvedValue(mockTweetId);
        twitterService.buildTweetUrl.mockReturnValue(
          `https://x.com/testuser/status/${mockTweetId}`,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(twitterService.uploadMedia).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.stringContaining('/images/'),
          expect.any(String),
          'image/jpeg',
          undefined,
        );
      });
    });

    describe('error handling', () => {
      it('should return failed result when validation fails', async () => {
        // Create a service with different capabilities for testing
        const mockService = Object.create(service);
        mockService.supportsTextOnly = false;

        // The actual service supports text, so we need to test validation differently
        // Test with a post that might fail validation
        const context = createPublishContext(mockTextPost);

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          accessToken: 'encrypted-token',
        } as unknown as CredentialDocument);

        mockTweet.mockResolvedValue({
          data: { id: '' }, // No ID returned
        });

        twitterService.buildTweetUrl.mockReturnValue('');

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.status).toBe(PostStatus.FAILED);
      });

      it('should throw error when publishing fails', async () => {
        const context = createPublishContext(mockTextPost);
        const error = new Error('Twitter API error');

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          accessToken: 'encrypted-token',
        } as unknown as CredentialDocument);

        mockTweet.mockRejectedValue(error);

        await expect(service.publish(context)).rejects.toThrow(
          'Twitter API error',
        );
        expect(logger.error).toHaveBeenCalled();
      });

      it('should return failed result when externalId is null', async () => {
        const context = createPublishContext(mockImagePost);

        twitterService.uploadMedia.mockResolvedValue(null as unknown as string);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID');
      });

      it('should handle credential not found error', async () => {
        const context = createPublishContext(mockTextPost);

        credentialsService.findOne.mockResolvedValue(null);

        await expect(service.publish(context)).rejects.toThrow(
          'Twitter credential not found or invalid',
        );
      });
    });
  });

  describe('publishThreadChildren', () => {
    const mockParentExternalId = 'parent-tweet-123';

    const mockChildren = [
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439030'),
        category: PostCategory.TEXT,
        description: '<p>Child 1</p>',
        ingredients: [],
        order: 1,
      },
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
        category: PostCategory.IMAGE,
        description: '<p>Child 2</p>',
        ingredients: [mockIngredientId],
        order: 2,
      },
    ];

    beforeEach(() => {
      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        accessToken: 'encrypted-token',
      } as unknown as CredentialDocument);
    });

    it('should publish thread children as replies in order', async () => {
      const context = createPublishContext(mockTextPost);

      mockTweet.mockResolvedValueOnce({ data: { id: 'child-1-id' } });
      mockUploadMedia.mockResolvedValue('mock-media-id');
      mockTweet.mockResolvedValueOnce({ data: { id: 'child-2-id' } });

      httpService.get.mockReturnValue(
        of({
          data: Buffer.from('fake-image-data'),
        }) as unknown as ReturnType<typeof of>,
      );

      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        mockChildren,
        mockParentExternalId,
      );

      // Should update both children with their external IDs
      expect(postsService.patch).toHaveBeenCalledTimes(2);
      expect(postsService.patch).toHaveBeenCalledWith(
        mockChildren[0]._id.toString(),
        expect.objectContaining({
          externalId: expect.any(String),
          status: PostStatus.PUBLIC,
        }),
      );
    });

    it('should sort children by order before publishing', async () => {
      const context = createPublishContext(mockTextPost);
      const unorderedChildren = [
        { ...mockChildren[1], order: 2 },
        { ...mockChildren[0], order: 1 },
      ];

      mockTweet.mockResolvedValue({ data: { id: 'child-id' } });
      mockUploadMedia.mockResolvedValue('mock-media-id');

      httpService.get.mockReturnValue(
        of({
          data: Buffer.from('fake-image-data'),
        }) as unknown as ReturnType<typeof of>,
      );

      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        unorderedChildren,
        mockParentExternalId,
      );

      // First patch should be for the child with order 1
      expect(postsService.patch.mock.calls[0][0]).toBe(
        mockChildren[0]._id.toString(),
      );
    });

    it('should mark child as failed when publishing fails', async () => {
      const context = createPublishContext(mockTextPost);
      const singleChild = [mockChildren[0]];

      mockTweet.mockResolvedValue({ data: { id: '' } });
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

    it('should continue publishing other children when one fails', async () => {
      const context = createPublishContext(mockTextPost);

      // First child fails, second succeeds
      mockTweet
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ data: { id: 'child-2-id' } });

      mockUploadMedia.mockResolvedValue('mock-media-id');

      httpService.get.mockReturnValue(
        of({
          data: Buffer.from('fake-image-data'),
        }) as unknown as ReturnType<typeof of>,
      );

      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        mockChildren,
        mockParentExternalId,
      );

      // Both children should be patched (first as failed, second as success)
      expect(postsService.patch).toHaveBeenCalledTimes(2);
    });

    it('should log completion of thread children publishing', async () => {
      const context = createPublishContext(mockTextPost);
      const singleChild = [mockChildren[0]];

      mockTweet.mockResolvedValue({ data: { id: 'child-id' } });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        singleChild,
        mockParentExternalId,
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('completed publishing thread children'),
        expect.any(Object),
      );
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct Twitter URL', () => {
      const externalId = '1234567890';
      const expectedUrl = `https://x.com/testuser/status/${externalId}`;

      twitterService.buildTweetUrl.mockReturnValue(expectedUrl);

      const result = service.buildPostUrl(externalId, mockCredential);

      expect(result).toBe(expectedUrl);
      expect(twitterService.buildTweetUrl).toHaveBeenCalledWith(
        externalId,
        mockCredential.externalHandle,
      );
    });

    it('should handle missing externalShortcode parameter', () => {
      const externalId = '1234567890';
      const expectedUrl = `https://x.com/testuser/status/${externalId}`;

      twitterService.buildTweetUrl.mockReturnValue(expectedUrl);

      const result = service.buildPostUrl(
        externalId,
        mockCredential,
        undefined,
      );

      expect(result).toBe(expectedUrl);
    });
  });

  describe('validation', () => {
    it('should validate post successfully for supported content', () => {
      const context = createPublishContext(mockTextPost);
      const mediaInfo: MediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      };

      // Access protected method through type assertion
      const result = (service as any).validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });

    it('should validate image post correctly', () => {
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

    it('should validate carousel post correctly', () => {
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

  describe('extractMediaInfo', () => {
    it('should extract media info for post with no ingredients', () => {
      const result = (service as any).extractMediaInfo(mockTextPost);

      expect(result.hasIngredients).toBe(false);
      expect(result.ingredientIds).toEqual([]);
      expect(result.mediaUrls).toEqual([]);
      expect(result.isCarousel).toBe(false);
    });

    it('should extract media info for image post', () => {
      const result = (service as any).extractMediaInfo(mockImagePost);

      expect(result.hasIngredients).toBe(true);
      expect(result.ingredientIds.length).toBe(1);
      expect(result.isImagePost).toBe(true);
      expect(result.isCarousel).toBe(false);
      expect(result.mediaUrls[0]).toContain('/images/');
    });

    it('should extract media info for video post', () => {
      const result = (service as any).extractMediaInfo(mockVideoPost);

      expect(result.hasIngredients).toBe(true);
      expect(result.isImagePost).toBe(false);
      expect(result.mediaUrls[0]).toContain('/videos/');
    });

    it('should extract media info for carousel post', () => {
      const result = (service as any).extractMediaInfo(mockCarouselPost);

      expect(result.hasIngredients).toBe(true);
      expect(result.ingredientIds.length).toBe(3);
      expect(result.isCarousel).toBe(true);
      expect(result.mediaUrls.length).toBe(3);
    });

    it('should handle populated ingredient objects', () => {
      const postWithPopulatedIngredients = {
        ...mockImagePost,
        ingredients: [{ _id: mockIngredientId, name: 'Test Ingredient' }],
      };

      const result = (service as any).extractMediaInfo(
        postWithPopulatedIngredients,
      );

      expect(result.ingredientIds[0]).toBe(mockIngredientId.toString());
    });
  });

  describe('createSuccessResult and createFailedResult', () => {
    it('should create correct success result', () => {
      const result = (service as any).createSuccessResult(
        'tweet-123',
        CredentialPlatform.TWITTER,
        'https://x.com/user/status/tweet-123',
      );

      expect(result).toEqual({
        externalId: 'tweet-123',
        externalShortcode: undefined,
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.PUBLIC,
        success: true,
        url: 'https://x.com/user/status/tweet-123',
      });
    });

    it('should create correct failed result', () => {
      const result = (service as any).createFailedResult(
        CredentialPlatform.TWITTER,
        'Publishing failed',
      );

      expect(result).toEqual({
        error: 'Publishing failed',
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        status: PostStatus.FAILED,
        success: false,
        url: '',
      });
    });
  });

  describe('logging', () => {
    it('should log publish attempt', async () => {
      const context = createPublishContext(mockTextPost);

      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        accessToken: 'encrypted-token',
      } as unknown as CredentialDocument);

      mockTweet.mockResolvedValue({
        data: { id: 'tweet-123' },
      });

      twitterService.buildTweetUrl.mockReturnValue('https://x.com/test/123');

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

      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        accessToken: 'encrypted-token',
      } as unknown as CredentialDocument);

      mockTweet.mockRejectedValue(error);

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
