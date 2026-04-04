import { ConfigService } from '@api/config/config.service';
import { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
import { FanvuePublisherService } from '@api/services/integrations/publishers/fanvue-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('FanvuePublisherService', () => {
  let service: FanvuePublisherService;
  let fanvueService: {
    createPost: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
    uploadMedia: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = new Types.ObjectId().toHexString();
  const brandId = new Types.ObjectId().toHexString();

  const mockCredential = {
    _id: new Types.ObjectId(),
    accessToken: 'encrypted-token',
    externalHandle: 'creator-handle',
    platform: CredentialPlatform.FANVUE,
  };

  const makeContext = (
    overrides: Partial<PublishContext> = {},
  ): PublishContext => ({
    brandId,
    credential: mockCredential as never,
    isDraft: false,
    organization: {} as never,
    organizationId: orgId,
    post: {
      _id: new Types.ObjectId().toString(),
      category: PostCategory.TEXT,
      description: '<p>Hello world</p>',
      ingredients: [],
      label: 'Test Post',
      status: PostStatus.DRAFT,
    } as never,
    postId: new Types.ObjectId().toString(),
    ...overrides,
  });

  beforeEach(async () => {
    fanvueService = {
      createPost: vi.fn().mockResolvedValue({ uuid: 'fanvue-post-123' }),
      refreshToken: vi.fn().mockResolvedValue({ accessToken: 'fresh-token' }),
      uploadMedia: vi.fn().mockResolvedValue('media-uuid-1'),
    };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FanvuePublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
          },
        },
        { provide: FanvueService, useValue: fanvueService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<FanvuePublisherService>(FanvuePublisherService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose correct platform capabilities', () => {
    expect(service.platform).toBe(CredentialPlatform.FANVUE);
    expect(service.supportsTextOnly).toBe(true);
    expect(service.supportsImages).toBe(true);
    expect(service.supportsVideos).toBe(true);
    expect(service.supportsCarousel).toBe(false);
    expect(service.supportsThreads).toBe(false);
  });

  describe('publish', () => {
    it('should publish a text-only post successfully', async () => {
      const result = await service.publish(makeContext());

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('fanvue-post-123');
      expect(result.platform).toBe(CredentialPlatform.FANVUE);
    });

    it('should refresh token before publishing', async () => {
      await service.publish(makeContext());

      expect(fanvueService.refreshToken).toHaveBeenCalledWith(orgId, brandId);
    });

    it('should create post with sanitized description', async () => {
      await service.publish(makeContext());

      expect(fanvueService.createPost).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.any(String),
        undefined,
      );
    });

    it('should upload media when post has image ingredients', async () => {
      const ingredientId = new Types.ObjectId();
      const context = makeContext({
        post: {
          category: PostCategory.IMAGE,
          description: '<p>Image post</p>',
          ingredients: [ingredientId],
          label: 'Image Post',
          status: PostStatus.DRAFT,
        } as never,
      });

      await service.publish(context);

      expect(fanvueService.uploadMedia).toHaveBeenCalledWith(
        'fresh-token',
        expect.stringContaining('images'),
        'image',
      );
      expect(fanvueService.createPost).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.any(String),
        ['media-uuid-1'],
      );
    });

    it('should upload multiple media for multi-ingredient posts', async () => {
      const ingredientIds = [new Types.ObjectId(), new Types.ObjectId()];
      const context = makeContext({
        post: {
          category: PostCategory.IMAGE,
          description: '<p>Multi image</p>',
          ingredients: ingredientIds,
          label: 'Multi Image',
          status: PostStatus.DRAFT,
        } as never,
      });

      await service.publish(context);

      expect(fanvueService.uploadMedia).toHaveBeenCalledTimes(2);
      expect(fanvueService.createPost).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.any(String),
        ['media-uuid-1', 'media-uuid-1'],
      );
    });

    it('should return failed result when Fanvue returns no uuid', async () => {
      fanvueService.createPost.mockResolvedValue({ uuid: undefined });

      const result = await service.publish(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should rethrow errors from FanvueService', async () => {
      fanvueService.refreshToken.mockRejectedValue(
        new Error('Token refresh failed'),
      );

      await expect(service.publish(makeContext())).rejects.toThrow(
        'Token refresh failed',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('buildPostUrl', () => {
    it('should build the correct Fanvue post URL', () => {
      const url = service.buildPostUrl('post-abc-123', mockCredential as never);

      expect(url).toBe('https://www.fanvue.com/post/post-abc-123');
    });
  });
});
