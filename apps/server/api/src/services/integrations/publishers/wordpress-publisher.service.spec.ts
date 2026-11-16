import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WordpressPublisherService } from '@api/services/integrations/publishers/wordpress-publisher.service';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { CredentialPlatform, PublishErrorKind } from '@genfeedai/contracts';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => val),
    encrypt: vi.fn((val: string) => val),
  },
}));

describe('WordpressPublisherService', () => {
  let service: WordpressPublisherService;
  let configService: ConfigService;
  let logger: LoggerService;
  let wordpressService: WordpressService;

  beforeEach(() => {
    configService = {} as ConfigService;

    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    wordpressService = {
      createPost: vi.fn(),
    } as unknown as WordpressService;

    service = new WordpressPublisherService(
      configService,
      logger,
      wordpressService,
    );
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have correct platform capabilities', () => {
      expect(service.platform).toBe(CredentialPlatform.WORDPRESS);
      expect(service.supportsTextOnly).toBe(true);
      expect(service.supportsImages).toBe(true);
      expect(service.supportsVideos).toBe(false);
      expect(service.supportsCarousel).toBe(false);
      expect(service.supportsThreads).toBe(false);
    });
  });

  describe('publish', () => {
    const mockBrandId = testId('brand');
    const mockOrgId = testId('org');
    const mockCredentialId = testId('credential');
    const mockPostId = testId('post');

    const makeContext = (
      credential: Partial<CredentialDocument>,
      post: Partial<PostEntity> = {},
    ): PublishContext => ({
      settings: {},
      brandId: mockBrandId,
      credential: credential as unknown as CredentialDocument,
      organization: {
        id: mockOrgId,
      } as unknown as OrganizationDocument,
      organizationId: mockOrgId,
      post: {
        id: mockPostId,
        description: 'This is a test post',
        label: 'Test Post',
        ...post,
      } as unknown as PostEntity,
      postId: 'post-123',
    });

    const connectedAccount = {
      id: mockCredentialId,
      accessToken: 'encrypted-token',
      externalId: 'site-123',
      platform: PrismaCredentialPlatform.WORDPRESS,
    };

    it('should publish a text-only post successfully', async () => {
      vi.mocked(wordpressService.createPost).mockResolvedValue('wp-post-123');

      const result = await service.publish(makeContext(connectedAccount));

      expect(result.success).toBe(true);
      expect(wordpressService.createPost).toHaveBeenCalledWith(
        'encrypted-token',
        'site-123',
        'Test Post',
        expect.any(String),
        'publish',
        undefined,
        undefined,
        undefined,
      );
    });

    it('should publish to the site on the context, not a sibling account', async () => {
      // A brand with two WordPress sites publishes to the site carried by the
      // post's own credential.
      vi.mocked(wordpressService.createPost).mockResolvedValue('wp-post-456');

      await service.publish(
        makeContext({
          ...connectedAccount,
          id: testId('credential-2'),
          accessToken: 'encrypted-token-2',
          externalId: 'site-456',
        } as unknown as CredentialDocument),
      );

      expect(wordpressService.createPost).toHaveBeenCalledWith(
        'encrypted-token-2',
        'site-456',
        expect.any(String),
        expect.any(String),
        'publish',
        undefined,
        undefined,
        undefined,
      );
    });

    it('should return failure when credential not found', async () => {
      const result = await service.publish(
        makeContext(undefined as unknown as CredentialDocument),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('credential');
      expect(result.errorKind).toBe(PublishErrorKind.CHANNEL_DISCONNECTED);
    });

    it('should return failure when credential missing accessToken', async () => {
      const result = await service.publish(
        makeContext({
          id: mockCredentialId,
          platform: PrismaCredentialPlatform.WORDPRESS,
        }),
      );

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it.each([
      [401, PublishErrorKind.CHANNEL_DISCONNECTED],
      [404, PublishErrorKind.CHANNEL_DISCONNECTED],
      [422, PublishErrorKind.CONTENT_REJECTED],
      [503, PublishErrorKind.OUTCOME_UNKNOWN],
    ])('throws a typed publish error for HTTP %i', async (status, kind) => {
      vi.mocked(wordpressService.createPost).mockRejectedValue(
        Object.assign(new Error('provider failed'), {
          response: { headers: {}, status },
        }),
      );

      await expect(
        service.publish(makeContext(connectedAccount)),
      ).rejects.toMatchObject({
        httpStatus: status,
        kind,
        name: 'PublishError',
      });
    });

    it('throws rate_limited with the wait the provider gave', async () => {
      vi.mocked(wordpressService.createPost).mockRejectedValue(
        Object.assign(new Error('provider failed'), {
          response: { headers: { 'retry-after': '20' }, status: 429 },
        }),
      );

      await expect(
        service.publish(makeContext(connectedAccount)),
      ).rejects.toMatchObject({
        kind: PublishErrorKind.RATE_LIMITED,
        retryAfterMs: 20_000,
      });
    });

    it('throws outcome_unknown when the connection drops mid-request', async () => {
      vi.mocked(wordpressService.createPost).mockRejectedValue(
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      );

      await expect(
        service.publish(makeContext(connectedAccount)),
      ).rejects.toMatchObject({
        kind: PublishErrorKind.OUTCOME_UNKNOWN,
      });
    });

    it('returns outcome_unknown when WordPress accepts the post without an id', async () => {
      vi.mocked(wordpressService.createPost).mockResolvedValue('');

      const result = await service.publish(makeContext(connectedAccount));

      expect(result.success).toBe(false);
      expect(result.errorKind).toBe(PublishErrorKind.OUTCOME_UNKNOWN);
    });
  });
});
