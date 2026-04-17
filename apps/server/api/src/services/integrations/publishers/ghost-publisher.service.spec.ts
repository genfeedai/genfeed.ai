vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `dec:${v}`) },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('GhostPublisherService', () => {
  let service: GhostPublisherService;
  let ghostService: { createPost: ReturnType<typeof vi.fn> };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();

  const mockCredential = {
    _id: new Types.ObjectId(),
    accessToken: 'encrypted-token',
    externalHandle: 'https://myblog.ghost.io',
    platform: CredentialPlatform.GHOST,
  };

  const makeContext = (
    overrides: Partial<PublishContext> = {},
  ): PublishContext => ({
    brandId,
    credential: mockCredential as never,
    isDraft: false,
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
    ghostService = {
      createPost: vi.fn().mockResolvedValue({
        id: 'ghost-post-123',
        url: 'https://myblog.ghost.io/p/ghost-post-123',
      }),
    };
    credentialsService = { findOne: vi.fn().mockResolvedValue(mockCredential) };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhostPublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
          },
        },
        { provide: GhostService, useValue: ghostService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<GhostPublisherService>(GhostPublisherService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose correct platform capabilities', () => {
    expect(service.platform).toBe(CredentialPlatform.GHOST);
    expect(service.supportsTextOnly).toBe(true);
    expect(service.supportsImages).toBe(true);
    expect(service.supportsVideos).toBe(false);
    expect(service.supportsCarousel).toBe(false);
    expect(service.supportsThreads).toBe(false);
  });

  describe('publish', () => {
    it('should publish a text post successfully', async () => {
      const result = await service.publish(makeContext());
      expect(result.success).toBe(true);
      expect(result.externalId).toBe('ghost-post-123');
    });

    it('should decrypt the access token before calling GhostService', async () => {
      await service.publish(makeContext());
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
      expect(ghostService.createPost).toHaveBeenCalledWith(
        'https://myblog.ghost.io',
        'dec:encrypted-token',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        undefined,
      );
    });

    it('should return failed result when credential is missing', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const result = await service.publish(makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/credential/i);
    });

    it('should return failed result when Ghost returns no post id', async () => {
      ghostService.createPost.mockResolvedValue({ id: undefined });
      const result = await service.publish(makeContext());
      expect(result.success).toBe(false);
    });

    it('should publish as draft when isDraft is true', async () => {
      await service.publish(makeContext({ isDraft: true }));
      expect(ghostService.createPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        'draft',
        undefined,
      );
    });

    it('should pass featured image URL when post has an image ingredient', async () => {
      const context = makeContext({
        post: {
          category: PostCategory.IMAGE,
          description: '<p>Image post</p>',
          ingredients: [new Types.ObjectId()],
          label: 'Image Post',
          status: PostStatus.DRAFT,
        } as never,
      });

      await service.publish(context);

      expect(ghostService.createPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.stringContaining('images'),
      );
    });

    it('should rethrow errors from GhostService', async () => {
      ghostService.createPost.mockRejectedValue(new Error('Ghost API error'));
      await expect(service.publish(makeContext())).rejects.toThrow(
        'Ghost API error',
      );
    });
  });

  describe('buildPostUrl', () => {
    it('should build URL from credential externalHandle', () => {
      const url = service.buildPostUrl('post-123', mockCredential as never);
      expect(url).toBe('https://myblog.ghost.io/p/post-123');
    });

    it('should handle missing externalHandle gracefully', () => {
      const url = service.buildPostUrl('post-abc', {
        externalHandle: '',
      } as never);
      expect(url).toBe('/p/post-abc');
    });
  });
});
