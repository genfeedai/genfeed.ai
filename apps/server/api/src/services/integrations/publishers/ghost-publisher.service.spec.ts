vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `dec:${v}`) },
}));

import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WebhookUrlUnresolvableException } from '@api/shared/utils/webhook-validator/webhook-validator.util';
import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  PublishErrorKind,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('GhostPublisherService', () => {
  let service: GhostPublisherService;
  let ghostService: { createPost: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id';
  const brandId = 'test-object-id';

  const mockCredential = {
    id: 'test-object-id',
    accessToken: 'encrypted-token',
    externalId: 'https://myblog.ghost.io',
    platform: CredentialPlatform.GHOST,
  };

  const mockOrganization = {
    id: orgId,
    isDeleted: false,
    name: 'Test Organization',
  } as unknown as OrganizationDocument;

  const makeContext = (
    overrides: Partial<PublishContext> = {},
  ): PublishContext => ({
    settings: {},
    brandId,
    credential: mockCredential as never,
    isDraft: false,
    organization: mockOrganization,
    organizationId: orgId,
    post: {
      id: 'test-object-id',
      category: PostCategory.TEXT,
      description: '<p>Hello world</p>',
      ingredients: [],
      label: 'Test Post',
      status: PostStatus.DRAFT,
    } as never,
    postId: 'test-object-id',
    ...overrides,
  });

  beforeEach(async () => {
    ghostService = {
      createPost: vi.fn().mockResolvedValue({
        id: 'ghost-post-123',
        url: 'https://myblog.ghost.io/p/ghost-post-123',
      }),
    };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhostPublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
            isAuthorizedMediaDeliveryEnabled: true,
          },
        },
        { provide: GhostService, useValue: ghostService },
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

    it('should publish as the account on the context, not a sibling account', async () => {
      const secondAccount = {
        id: 'second-account-id',
        accessToken: 'encrypted-token-2',
        externalId: 'https://second.ghost.io',
        platform: CredentialPlatform.GHOST,
      };

      await service.publish(
        makeContext({ credential: secondAccount as never }),
      );

      expect(ghostService.createPost).toHaveBeenCalledWith(
        'https://second.ghost.io',
        'dec:encrypted-token-2',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        undefined,
      );
    });

    it('should return failed result when credential is missing', async () => {
      const result = await service.publish(
        makeContext({ credential: undefined as never }),
      );
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
          ingredients: [
            {
              id: 'test-object-id',
              mediaUrl:
                'https://authorized.test/ingredients/images/random-storage-key?signature=fixture',
            },
          ],
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

    it.each([
      [401, PublishErrorKind.CHANNEL_DISCONNECTED],
      [404, PublishErrorKind.CHANNEL_DISCONNECTED],
      [422, PublishErrorKind.CONTENT_REJECTED],
      [503, PublishErrorKind.OUTCOME_UNKNOWN],
    ])('throws a typed publish error for HTTP %i', async (status, kind) => {
      ghostService.createPost.mockRejectedValue(
        Object.assign(new Error('provider failed'), {
          response: { headers: {}, status },
        }),
      );

      await expect(service.publish(makeContext())).rejects.toMatchObject({
        httpStatus: status,
        kind,
        name: 'PublishError',
      });
    });

    it('throws rate_limited with the wait the provider gave', async () => {
      ghostService.createPost.mockRejectedValue(
        Object.assign(new Error('provider failed'), {
          response: { headers: { 'retry-after': '20' }, status: 429 },
        }),
      );

      await expect(service.publish(makeContext())).rejects.toMatchObject({
        kind: PublishErrorKind.RATE_LIMITED,
        retryAfterMs: 20_000,
      });
    });

    it('throws outcome_unknown when the connection drops mid-request', async () => {
      ghostService.createPost.mockRejectedValue(
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      );

      await expect(service.publish(makeContext())).rejects.toMatchObject({
        kind: PublishErrorKind.OUTCOME_UNKNOWN,
      });
    });

    it('throws retry_later when the stored site address does not resolve', async () => {
      ghostService.createPost.mockRejectedValue(
        new WebhookUrlUnresolvableException(),
      );

      await expect(service.publish(makeContext())).rejects.toMatchObject({
        kind: PublishErrorKind.RETRY_LATER,
      });
    });

    it('throws channel_disconnected when the stored site address is refused', async () => {
      ghostService.createPost.mockRejectedValue(
        new BadRequestException('private address'),
      );

      await expect(service.publish(makeContext())).rejects.toMatchObject({
        kind: PublishErrorKind.CHANNEL_DISCONNECTED,
      });
    });

    it('returns outcome_unknown when Ghost accepts the post without an id', async () => {
      ghostService.createPost.mockResolvedValue({});

      const result = await service.publish(makeContext());

      expect(result.success).toBe(false);
      expect(result.errorKind).toBe(PublishErrorKind.OUTCOME_UNKNOWN);
    });
  });

  describe('buildPostUrl', () => {
    it('should build URL from credential externalId', () => {
      const url = service.buildPostUrl('post-123', mockCredential as never);
      expect(url).toBe('https://myblog.ghost.io/p/post-123');
    });

    it('should handle missing externalId gracefully', () => {
      const url = service.buildPostUrl('post-abc', {
        externalId: '',
      } as never);
      expect(url).toBe('/p/post-abc');
    });
  });
});
