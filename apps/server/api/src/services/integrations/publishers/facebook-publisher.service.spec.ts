/**
 * @fileoverview Tests for FacebookPublisherService
 * @description Comprehensive tests covering all public methods, error handling, and edge cases
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { FacebookPublisherService } from '@api/services/integrations/publishers/facebook-publisher.service';
import type {
  MediaInfo,
  PublishContext,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('FacebookPublisherService', () => {
  let service: FacebookPublisherService;
  let _configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;
  let facebookService: vi.Mocked<FacebookService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let postsService: vi.Mocked<PostsService>;

  // Test IDs
  const mockOrganizationId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockBrandId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockPostId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const mockUserId = new Types.ObjectId('507f1f77bcf86cd799439014');
  const mockCredentialId = new Types.ObjectId('507f1f77bcf86cd799439015');
  const mockIngredientId = new Types.ObjectId('507f1f77bcf86cd799439016');
  const mockPageId = 'page-123456789';

  // Mock credential
  const mockCredential = {
    _id: mockCredentialId,
    accessToken: 'encrypted-access-token',
    brand: mockBrandId,
    externalHandle: 'testpage',
    externalId: mockPageId,
    isDeleted: false,
    organization: mockOrganizationId,
    platform: CredentialPlatform.FACEBOOK,
    user: mockUserId,
  } as unknown as CredentialDocument;

  // Mock organization
  const mockOrganization = {
    _id: mockOrganizationId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  // Mock Facebook page response
  const mockPageResponse = {
    accessToken: 'page-access-token-123',
    id: mockPageId,
    name: 'Test Page',
  };

  // Mock post for text-only (not supported on Facebook)
  const mockTextPost = {
    _id: mockPostId,
    brand: mockBrandId,
    category: PostCategory.TEXT,
    description: '<p>Test Facebook content</p>',
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
    description: '<p>Test video post</p>',
    ingredients: [mockIngredientId],
    isDeleted: false,
    label: 'Video Title',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookPublisherService,
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
          provide: FacebookService,
          useValue: {
            getUserPages: vi.fn(),
            postComment: vi.fn(),
            uploadImage: vi.fn(),
            uploadVideo: vi.fn(),
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

    service = module.get<FacebookPublisherService>(FacebookPublisherService);
    _configService = module.get(ConfigService) as vi.Mocked<ConfigService>;
    logger = module.get(LoggerService) as vi.Mocked<LoggerService>;
    facebookService = module.get(FacebookService) as vi.Mocked<FacebookService>;
    credentialsService = module.get(
      CredentialsService,
    ) as vi.Mocked<CredentialsService>;
    postsService = module.get(PostsService) as vi.Mocked<PostsService>;
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform', () => {
      expect(service.platform).toBe(CredentialPlatform.FACEBOOK);
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

    it('should NOT support carousel', () => {
      expect(service.supportsCarousel).toBe(false);
    });

    it('should support threads', () => {
      expect(service.supportsThreads).toBe(true);
    });
  });

  describe('publish', () => {
    beforeEach(() => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      facebookService.getUserPages.mockResolvedValue([mockPageResponse]);
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

    describe('image posts', () => {
      it('should publish a single image successfully', async () => {
        const context = createPublishContext(mockImagePost);
        const mockPostIdResult = 'fb-post-123456789';

        facebookService.uploadImage.mockResolvedValue(mockPostIdResult);

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockPostIdResult);
        expect(result.platform).toBe(CredentialPlatform.FACEBOOK);
        expect(result.status).toBe(PostStatus.PUBLIC);
        expect(result.url).toContain(mockPostIdResult);
        expect(facebookService.uploadImage).toHaveBeenCalledWith(
          mockPageId,
          mockPageResponse.accessToken,
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

        facebookService.uploadImage.mockResolvedValue('fb-post-123');

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(facebookService.uploadImage).toHaveBeenCalled();
      });
    });

    describe('video posts', () => {
      it('should publish a video successfully', async () => {
        const context = createPublishContext(mockVideoPost);
        const mockVideoId = 'fb-video-123456789';

        facebookService.uploadVideo.mockResolvedValue(mockVideoId);

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(result.externalId).toBe(mockVideoId);
        expect(facebookService.uploadVideo).toHaveBeenCalledWith(
          mockOrganizationId.toString(),
          mockBrandId.toString(),
          expect.stringContaining('/videos/'),
          mockVideoPost.label,
          expect.any(String),
        );
      });

      it('should handle video post without label', async () => {
        const videoWithoutLabel = {
          ...mockVideoPost,
          label: undefined,
        } as unknown as PostEntity;
        const context = createPublishContext(videoWithoutLabel);

        facebookService.uploadVideo.mockResolvedValue('fb-video-123');

        const result = await service.publish(context);

        expect(result.success).toBe(true);
        expect(facebookService.uploadVideo).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          '',
          expect.any(String),
        );
      });
    });

    describe('carousel posts (not supported)', () => {
      it('should return failed result for carousel posts', async () => {
        const context = createPublishContext(mockCarouselPost);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('does not support carousel posts');
      });
    });

    describe('credential handling', () => {
      it('should return failed result when credential not found', async () => {
        const context = createPublishContext(mockImagePost);

        credentialsService.findOne.mockResolvedValue(null);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Facebook credential or page ID not found');
      });

      it('should return failed result when credential has no access token', async () => {
        const context = createPublishContext(mockImagePost);

        credentialsService.findOne.mockResolvedValue({
          ...mockCredential,
          accessToken: null,
        } as unknown as CredentialDocument);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Facebook credential or page ID not found');
      });

      it('should return failed result when page access token not found', async () => {
        const context = createPublishContext(mockImagePost);

        facebookService.getUserPages.mockResolvedValue([
          { accessToken: 'token', id: 'different-page-id' },
        ]);

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Facebook page access token not found');
      });
    });

    describe('error handling', () => {
      it('should return failed result when externalId is null', async () => {
        const context = createPublishContext(mockImagePost);

        facebookService.uploadImage.mockResolvedValue(
          null as unknown as string,
        );

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID');
      });

      it('should throw error when Facebook API fails', async () => {
        const context = createPublishContext(mockImagePost);
        const error = new Error('Facebook API error');

        facebookService.uploadImage.mockRejectedValue(error);

        await expect(service.publish(context)).rejects.toThrow(
          'Facebook API error',
        );
        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct Facebook URL', () => {
      const externalId = '123456789_987654321';

      const result = service.buildPostUrl(externalId, mockCredential);

      expect(result).toBe(`https://www.facebook.com/${externalId}`);
    });
  });

  describe('publishThreadChildren', () => {
    const mockParentExternalId = 'fb-post-parent123';

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

      facebookService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        mockChildren,
        mockParentExternalId,
      );

      // Should only post 2 comments (TEXT children only)
      expect(facebookService.postComment).toHaveBeenCalledTimes(2);
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

      expect(facebookService.postComment).not.toHaveBeenCalled();
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

      facebookService.postComment.mockResolvedValue({
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

      facebookService.postComment.mockResolvedValue({ commentId: '' });
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

      facebookService.postComment
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
      const context = createPublishContext(mockImagePost);
      const singleChild = [mockChildren[0]];

      facebookService.postComment.mockResolvedValue({
        commentId: 'comment-123',
      });
      postsService.patch.mockResolvedValue({} as unknown as PostDocument);

      await service.publishThreadChildren(
        context,
        singleChild,
        mockParentExternalId,
      );

      expect(postsService.patch).toHaveBeenCalledWith(
        singleChild[0]._id.toString(),
        expect.objectContaining({
          externalId: 'comment-123',
          publicationDate: expect.any(Date),
          status: PostStatus.PUBLIC,
        }),
      );
    });

    it('should log completion of comment posting', async () => {
      const context = createPublishContext(mockImagePost);
      const singleChild = [mockChildren[0]];

      facebookService.postComment.mockResolvedValue({
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

      const result = (service as any).validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not support carousel posts');
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

      const result = (service as any).validatePost(context, mediaInfo);

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

      const result = (service as any).validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });
  });

  describe('logging', () => {
    beforeEach(() => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      facebookService.getUserPages.mockResolvedValue([mockPageResponse]);
    });

    it('should log publish attempt', async () => {
      const context = createPublishContext(mockImagePost);

      facebookService.uploadImage.mockResolvedValue('fb-post-123');

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

      facebookService.uploadImage.mockRejectedValue(error);

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
