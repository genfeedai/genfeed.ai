import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WordpressPublisherService } from '@api/services/integrations/publishers/wordpress-publisher.service';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
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
  let credentialsService: CredentialsService;

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

    credentialsService = {
      findOne: vi.fn(),
    } as unknown as CredentialsService;

    service = new WordpressPublisherService(
      configService,
      logger,
      wordpressService,
      credentialsService,
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
    const mockBrandId = '507f1f77bcf86cd799439020';
    const mockOrgId = '507f1f77bcf86cd799439021';

    it('should publish a text-only post successfully', async () => {
      const context: PublishContext = {
        brandId: mockBrandId,
        credential: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          platform: CredentialPlatform.WORDPRESS,
        } as unknown as CredentialDocument,
        organization: {
          _id: new Types.ObjectId(mockOrgId),
        } as unknown as OrganizationDocument,
        organizationId: mockOrgId,
        post: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
          description: 'This is a test post',
          label: 'Test Post',
        } as unknown as PostEntity,
        postId: 'post-123',
      };

      const mockCredential = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        accessToken: 'encrypted-token',
        externalId: 'site-123',
        platform: CredentialPlatform.WORDPRESS,
      };

      vi.mocked(credentialsService.findOne).mockResolvedValue(
        mockCredential as CredentialDocument,
      );
      vi.mocked(wordpressService.createPost).mockResolvedValue('wp-post-123');

      const result = await service.publish(context);

      expect(result.success).toBe(true);
      expect(credentialsService.findOne).toHaveBeenCalled();
    });

    it('should return failure when credential not found', async () => {
      const context: PublishContext = {
        brandId: mockBrandId,
        credential: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          platform: CredentialPlatform.WORDPRESS,
        } as unknown as CredentialDocument,
        organization: {
          _id: new Types.ObjectId(mockOrgId),
        } as unknown as OrganizationDocument,
        organizationId: mockOrgId,
        post: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
          description: 'Test post',
        } as unknown as PostEntity,
        postId: 'post-123',
      };

      vi.mocked(credentialsService.findOne).mockResolvedValue(null);

      const result = await service.publish(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('credential');
    });

    it('should return failure when credential missing accessToken', async () => {
      const context: PublishContext = {
        brandId: mockBrandId,
        credential: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          platform: CredentialPlatform.WORDPRESS,
        } as unknown as CredentialDocument,
        organization: {
          _id: new Types.ObjectId(mockOrgId),
        } as unknown as OrganizationDocument,
        organizationId: mockOrgId,
        post: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
          description: 'Test post',
        } as unknown as PostEntity,
        postId: 'post-123',
      };

      const mockCredential = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        platform: CredentialPlatform.WORDPRESS,
        // Missing accessToken
      };

      vi.mocked(credentialsService.findOne).mockResolvedValue(
        mockCredential as CredentialDocument,
      );

      const result = await service.publish(context);

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should throw when WordPress API errors occur', async () => {
      const context: PublishContext = {
        brandId: mockBrandId,
        credential: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          platform: CredentialPlatform.WORDPRESS,
        } as unknown as CredentialDocument,
        organization: {
          _id: new Types.ObjectId(mockOrgId),
        } as unknown as OrganizationDocument,
        organizationId: mockOrgId,
        post: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
          description: 'Test content',
          label: 'Test Post',
        } as unknown as PostEntity,
        postId: 'post-123',
      };

      const mockCredential = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        accessToken: 'encrypted-token',
        externalId: 'site-123',
        platform: CredentialPlatform.WORDPRESS,
      };

      vi.mocked(credentialsService.findOne).mockResolvedValue(
        mockCredential as CredentialDocument,
      );
      vi.mocked(wordpressService.createPost).mockRejectedValue(
        new Error('WordPress API error'),
      );

      await expect(service.publish(context)).rejects.toThrow(
        'WordPress API error',
      );
    });
  });
});
