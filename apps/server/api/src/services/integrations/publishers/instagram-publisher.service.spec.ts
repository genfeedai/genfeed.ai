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
  let _configService: vi.Mocked<ConfigService>;
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
    ingredients: [
      {
        id: mockIngredientId,
        mediaUrl:
          'https://authorized.test/ingredients/images/random-storage-key?signature=fixture',
      },
    ],
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
    ingredients: [
      {
        id: mockIngredientId,
        mediaUrl:
          'https://authorized.test/ingredients/videos/random-storage-key?signature=fixture',
      },
    ],
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
      {
        id: testId('ingredient', 2),
        mediaUrl:
          'https://authorized.test/ingredients/images/random-storage-key?signature=fixture',
      },
      {
        id: testId('ingredient', 3),
        mediaUrl:
          'https://authorized.test/ingredients/images/random-storage-key?signature=fixture',
      },
      {
        id: testId('ingredient', 4),
        mediaUrl:
          'https://authorized.test/ingredients/images/random-storage-key?signature=fixture',
      },
    ],
    isDeleted: false,
    organizationId: mockOrganizationId,
    status: PostStatus.DRAFT,
    userId: mockUserId,
  } as unknown as PostEntity;

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
            cdnSignedUrlTtlSeconds: 900,
            get: vi.fn().mockReturnValue('test-value'),
            ingredientsEndpoint: 'https://api.test.com/ingredients',
            isAuthorizedMediaDeliveryEnabled: true,
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
            prepareContainer: vi.fn(),
            publishPreparedContainer: vi.fn(),
            uploadCarousel: vi.fn(),
            uploadImage: vi.fn(),
            uploadReel: vi.fn(),
            uploadStory: vi.fn(),
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

  describe('validatePost carousel image count', () => {
    const carouselMediaInfo = (count: number): MediaInfo => {
      const ingredientIds = Array.from(
        { length: count },
        (_, index) => `ingredient-${index + 1}`,
      );
      return {
        hasIngredients: true,
        ingredientIds,
        isCarousel: count > 1,
        isImagePost: true,
        mediaUrls: ingredientIds.map(
          (id) => `https://api.test.com/ingredients/images/${id}`,
        ),
      };
    };

    it.each([2, 10, 20])('passes a %i-image carousel', (count) => {
      const context = createPublishContext(
        mockImagePost as unknown as PostEntity,
      );
      expect(
        service.validatePost(context, carouselMediaInfo(count)).valid,
      ).toBe(true);
    });

    it.each([21, 25])(
      'rejects a %i-image carousel before any Graph call',
      (count) => {
        const context = createPublishContext(
          mockImagePost as unknown as PostEntity,
        );
        const result = service.validatePost(context, carouselMediaInfo(count));
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Instagram carousels take 2-20 images');
        expect(result.errorCode).toBe('carousel_image_count');
      },
    );
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

    it('should pass a caption exactly at the 2200-character Instagram limit', () => {
      const context = createPublishContext({
        ...mockImagePost,
        description: 'a'.repeat(2200),
      } as unknown as PostEntity);
      const result = service.validatePost(context, imageMediaInfo);
      expect(result.valid).toBe(true);
    });

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
          false, // isAiGenerated
          undefined, // altText
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
          false, // isAiGenerated
          undefined, // audio
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
          false, // isAiGenerated
          undefined, // audio
        );
      });

      it('passes the issued cover image URL to the Reel', async () => {
        const context = {
          ...createPublishContext(mockVideoPost, {
            coverImageId: 'cover-1',
          }),
          coverImageUrl: 'https://signed.test/cover.jpg',
        };

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
          'https://signed.test/cover.jpg',
          undefined,
          true,
          mockCredential.id,
          false,
          undefined, // audio
        );
      });

      it('should keep the feed copy for the default feed placement', async () => {
        const context = createPublishContext(mockVideoPost, {
          placement: 'feed',
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
          true,
          mockCredential.id,
          false, // isAiGenerated
          undefined, // audio
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
          mockCredential.id,
          false, // isAiGenerated
          undefined, // audio
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
          false, // isAiGenerated
          [undefined, undefined, undefined], // altTexts
        );
      });
    });

    describe('stories', () => {
      it('publishes an image as a story with the AI label, no caption and a stories link', async () => {
        instagramService.uploadStory.mockResolvedValue({ mediaId: 'story-1' });

        const result = await service.publish(
          createPublishContext(mockImagePost, {
            aiGenerated: true,
            placement: 'story',
          }),
        );

        expect(instagramService.uploadStory).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.stringContaining('/images/'),
          false,
          mockCredential.id,
          true,
        );
        expect(instagramService.uploadImage).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          externalId: 'story-1',
          success: true,
          url: 'https://www.instagram.com/stories/testuser/story-1/',
        });
      });

      it('publishes a video as a story, not a Reel', async () => {
        instagramService.uploadStory.mockResolvedValue({ mediaId: 'story-2' });

        await service.publish(
          createPublishContext(mockVideoPost, { placement: 'story' }),
        );

        expect(instagramService.uploadStory).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.stringContaining('/videos/'),
          true,
          mockCredential.id,
          false,
        );
        expect(instagramService.uploadReel).not.toHaveBeenCalled();
      });

      it('refuses a story with more than one media item before any Graph call', async () => {
        const result = await service.publish(
          createPublishContext(mockCarouselPost, { placement: 'story' }),
        );

        expect(result).toMatchObject({
          error: 'An Instagram story is one image or one video',
          success: false,
        });
        expect(instagramService.uploadStory).not.toHaveBeenCalled();
        expect(instagramService.uploadCarousel).not.toHaveBeenCalled();
      });

      it('cannot confirm an unconfirmed story through the media list', async () => {
        await expect(
          service.verifyPublished(
            createPublishContext(mockImagePost, { placement: 'story' }),
            new Date(),
          ),
        ).resolves.toBeNull();
      });
    });

    describe('Reel music', () => {
      beforeEach(() => {
        instagramService.uploadReel.mockResolvedValue({
          mediaId: 'm2',
          shortcode: 'S2',
        });
      });

      it('passes the chosen track and volumes to the Reel upload', async () => {
        await service.publish(
          createPublishContext(mockVideoPost, {
            audioId: ' 1234 ',
            audioVolume: 80,
            videoVolume: 10,
          }),
        );

        expect(instagramService.uploadReel.mock.calls[0][9]).toEqual({
          audio_id: '1234',
          audio_volume: 80,
          video_volume: 10,
        });
      });

      it('passes no audio when no track is chosen', async () => {
        await service.publish(
          createPublishContext(mockVideoPost, { audioVolume: 80 }),
        );

        expect(instagramService.uploadReel.mock.calls[0][9]).toBeUndefined();
      });
    });

    describe('AI label', () => {
      it('passes the AI label to the image, Reel and carousel upload when the setting is on', async () => {
        instagramService.uploadImage.mockResolvedValue({
          mediaId: 'm1',
          shortcode: 'S1',
        });
        instagramService.uploadReel.mockResolvedValue({
          mediaId: 'm2',
          shortcode: 'S2',
        });
        instagramService.uploadCarousel.mockResolvedValue({
          mediaId: 'm3',
          shortcode: 'S3',
        });

        await service.publish(
          createPublishContext(mockImagePost, { aiGenerated: true }),
        );
        await service.publish(
          createPublishContext(mockVideoPost, { aiGenerated: true }),
        );
        await service.publish(
          createPublishContext(mockCarouselPost, { aiGenerated: true }),
        );

        // isAiGenerated is argument 7 of the image and carousel uploads and
        // argument 9 of the Reel upload.
        expect(instagramService.uploadImage.mock.calls[0][6]).toBe(true);
        expect(instagramService.uploadReel.mock.calls[0][8]).toBe(true);
        expect(instagramService.uploadCarousel.mock.calls[0][6]).toBe(true);
      });
    });

    describe('alt text', () => {
      const withAltTexts = (
        post: PostEntity,
        altTexts: Array<string | undefined>,
      ) =>
        ({
          ...post,
          ingredients: (post.ingredients as unknown as object[]).map(
            (ingredient, index) => ({
              ...ingredient,
              altText: altTexts[index],
            }),
          ),
        }) as unknown as PostEntity;

      it("sends a single image the ingredient's alt text", async () => {
        instagramService.uploadImage.mockResolvedValue({
          mediaId: 'm1',
          shortcode: 'S1',
        });

        await service.publish(
          createPublishContext(
            withAltTexts(mockImagePost, ['  A red bicycle  ']),
          ),
        );

        expect(instagramService.uploadImage.mock.calls[0][7]).toBe(
          'A red bicycle',
        );
      });

      it('sends a carousel one alt text per slide, in slide order', async () => {
        instagramService.uploadCarousel.mockResolvedValue({
          mediaId: 'm3',
          shortcode: 'S3',
        });

        await service.publish(
          createPublishContext(
            withAltTexts(mockCarouselPost, ['One', '   ', 'Three']),
          ),
        );

        expect(instagramService.uploadCarousel.mock.calls[0][7]).toEqual([
          'One',
          undefined,
          'Three',
        ]);
      });

      it('sends no alt text for an ingredient without one', async () => {
        instagramService.uploadImage.mockResolvedValue({
          mediaId: 'm1',
          shortcode: 'S1',
        });

        await service.publish(createPublishContext(mockImagePost));

        expect(instagramService.uploadImage.mock.calls[0][7]).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should return failed result when externalId is null', async () => {
        const context = createPublishContext(mockImagePost);

        instagramService.uploadImage.mockResolvedValue({
          mediaId: null as unknown as string,
          shortcode: '',
        });

        const result = await service.publish(context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to get external ID');
        expect(result.errorKind).toBe('outcome_unknown');
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

      it('keeps the reason Instagram gave for a rejected request and logs it once as a warning', async () => {
        const context = createPublishContext(mockImagePost);
        instagramService.uploadImage.mockRejectedValue(
          Object.assign(new Error('Request failed with status code 400'), {
            isAxiosError: true,
            response: {
              data: {
                error: {
                  code: 100,
                  error_user_msg: 'The image aspect ratio is not supported.',
                  message: 'Invalid parameter',
                },
              },
              status: 400,
            },
          }),
        );

        await expect(service.publish(context)).rejects.toMatchObject({
          httpStatus: 400,
          kind: 'content_rejected',
          message:
            'Request failed with status code 400 - The image aspect ratio is not supported.',
          providerCode: '100',
        });
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('failed to publish'),
          expect.objectContaining({
            error:
              'Request failed with status code 400 - The image aspect ratio is not supported.',
            httpStatus: 400,
            providerCode: '100',
          }),
        );
      });

      it('reports the daily publishing limit as a rate limit', async () => {
        const context = createPublishContext(mockImagePost);
        instagramService.uploadImage.mockRejectedValue(
          Object.assign(new Error('Request failed with status code 400'), {
            isAxiosError: true,
            response: {
              data: { error: { code: 9, error_subcode: 2207042 } },
              headers: {},
              status: 400,
            },
          }),
        );

        await expect(service.publish(context)).rejects.toMatchObject({
          kind: 'rate_limited',
          name: 'PublishError',
        });
      });

      it('reports a 500 from Instagram as an unknown outcome', async () => {
        const context = createPublishContext(mockImagePost);
        instagramService.uploadImage.mockRejectedValue(
          Object.assign(new Error('Request failed with status code 500'), {
            isAxiosError: true,
            response: { data: {}, headers: {}, status: 500 },
          }),
        );

        await expect(service.publish(context)).rejects.toMatchObject({
          kind: 'outcome_unknown',
        });
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
        ingredients: [
          {
            id: mockIngredientId,
            mediaUrl:
              'https://authorized.test/ingredients/images/random-storage-key?signature=fixture',
          },
        ],
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
          ingredients: [
            {
              id: mockIngredientId,
              mediaUrl:
                'https://authorized.test/ingredients/images/random-storage-key?signature=fixture',
            },
          ],
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

    it('should sort children by order before posting', async () => {
      const context = createPublishContext(mockImagePost);
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
        unorderedChildren[1].id.toString(),
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
        singleChild[0].id.toString(),
        expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
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

      const result = service['validatePost'](context, mediaInfo);

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

      const result = service['validatePost'](context, mediaInfo);

      expect(result.valid).toBe(true);
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

    it('should pass validation when a reel placement has a video', () => {
      const context = createPublishContext(mockVideoPost, {
        placement: 'reel',
      });
      const mediaInfo: MediaInfo = {
        hasIngredients: true,
        ingredientIds: [mockIngredientId.toString()],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: ['https://api.test.com/ingredients/videos/123'],
      };

      expect(service.validatePost(context, mediaInfo).valid).toBe(true);
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

      const result = service['validatePost'](context, mediaInfo);

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

  describe('container prepared ahead of the due time', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('prepares a carousel container that stays usable for ten minutes', async () => {
      vi.useFakeTimers({ now: new Date('2026-11-27T11:55:00.000Z') });
      instagramService.prepareContainer.mockResolvedValue('container-9');

      const upload = await service.prepareUpload(
        createPublishContext(mockCarouselPost, { aiGenerated: true }),
      );

      expect(upload).toEqual({
        expiresAt: new Date('2026-11-27T12:05:00.000Z'),
        providerUploadId: 'container-9',
      });
      expect(instagramService.prepareContainer.mock.calls[0][2]).toMatchObject({
        caption: 'Carousel post',
        isAiGenerated: true,
        kind: 'carousel',
      });
    });

    it('prepares a reel-only placement without the feed copy', async () => {
      instagramService.prepareContainer.mockResolvedValue('container-9');

      await service.prepareUpload(
        createPublishContext(mockVideoPost, { placement: 'reel' }),
      );

      expect(instagramService.prepareContainer.mock.calls[0][2]).toMatchObject({
        isShareToFeedSelected: false,
        kind: 'reel',
      });
    });

    it('prepares nothing for a post Instagram cannot take', async () => {
      const upload = await service.prepareUpload(
        createPublishContext(mockTextPost),
      );

      expect(upload).toBeNull();
      expect(instagramService.prepareContainer).not.toHaveBeenCalled();
    });

    it('publishes a prepared container as a post with its shortcode link', async () => {
      instagramService.publishPreparedContainer.mockResolvedValue({
        mediaId: 'media-1',
        shortcode: 'SHORT1',
      });

      const result = await service.publishPrepared(
        createPublishContext(mockCarouselPost),
        { expiresAt: new Date(), providerUploadId: 'container-9' },
      );

      expect(result).toMatchObject({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'media-1',
        externalShortcode: 'SHORT1',
        success: true,
        url: 'https://www.instagram.com/p/SHORT1',
      });
    });

    it('publishes a prepared story with a stories link', async () => {
      instagramService.publishPreparedContainer.mockResolvedValue({
        mediaId: 'story-1',
        shortcode: null,
      });

      const result = await service.publishPrepared(
        createPublishContext(mockImagePost, { placement: 'story' }),
        { expiresAt: new Date(), providerUploadId: 'container-9' },
      );

      expect(result).toMatchObject({
        externalId: 'story-1',
        success: true,
        url: 'https://www.instagram.com/stories/testuser/story-1/',
      });
    });
  });
});
