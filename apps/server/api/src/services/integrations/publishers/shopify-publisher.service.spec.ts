/**
 * @fileoverview Tests for ShopifyPublisherService
 */

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { ShopifyPublisherService } from '@api/services/integrations/publishers/shopify-publisher.service';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn(() => 'decrypted-token'),
  },
}));

describe('ShopifyPublisherService', () => {
  let service: ShopifyPublisherService;
  let shopifyService: vi.Mocked<ShopifyService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const orgId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const brandId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const postId = new Types.ObjectId('507f1f77bcf86cd799439013');

  const mockCredential = {
    _id: new Types.ObjectId(),
    accessToken: 'encrypted-token',
    brand: brandId,
    externalHandle: 'mystore.myshopify.com',
    organization: orgId,
    platform: CredentialPlatform.SHOPIFY,
  } as unknown as CredentialDocument;

  const mockOrganization = {
    _id: orgId,
    name: 'Test Org',
  } as unknown as OrganizationDocument;

  const mockPost = {
    _id: postId,
    brand: brandId,
    category: PostCategory.IMAGE,
    description: '<p>Product description</p>',
    ingredients: [new Types.ObjectId()],
    label: 'My Product',
    organization: orgId,
    status: PostStatus.DRAFT,
  } as unknown as PostEntity;

  const makeContext = (
    overrides?: Partial<PublishContext>,
  ): PublishContext => ({
    brandId: brandId.toString(),
    credential: mockCredential,
    organization: mockOrganization,
    organizationId: orgId.toString(),
    post: mockPost,
    postId: postId.toString(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyPublisherService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn() },
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
          provide: ShopifyService,
          useValue: {
            createProduct: vi.fn(),
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

    service = module.get<ShopifyPublisherService>(ShopifyPublisherService);
    shopifyService = module.get(ShopifyService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have correct platform capabilities', () => {
    expect(service.platform).toBe(CredentialPlatform.SHOPIFY);
    expect(service.supportsTextOnly).toBe(true);
    expect(service.supportsImages).toBe(true);
    expect(service.supportsVideos).toBe(false);
    expect(service.supportsCarousel).toBe(true);
    expect(service.supportsThreads).toBe(false);
  });

  describe('publish', () => {
    it('should create a Shopify product and return success result', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      shopifyService.createProduct.mockResolvedValue({
        handle: 'my-product',
        id: 'shopify-product-123',
        onlineStoreUrl: 'https://mystore.myshopify.com/products/my-product',
      } as never);

      const result = await service.publish(makeContext());

      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
      expect(shopifyService.createProduct).toHaveBeenCalledWith(
        'mystore.myshopify.com',
        'decrypted-token',
        'My Product',
        '<p>Product description</p>',
        expect.any(Array),
      );
      expect(result.success).toBe(true);
      expect(result.externalId).toBe('shopify-product-123');
      expect(result.url).toBe(
        'https://mystore.myshopify.com/products/my-product',
      );
    });

    it('should fall back to buildPostUrl when onlineStoreUrl is not present', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      shopifyService.createProduct.mockResolvedValue({
        handle: 'my-product',
        id: 'shopify-product-456',
        onlineStoreUrl: null,
      } as never);

      const result = await service.publish(makeContext());

      expect(result.url).toBe(
        'https://mystore.myshopify.com/products/my-product',
      );
    });

    it('should return failed result when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      const result = await service.publish(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Shopify credential/i);
      expect(shopifyService.createProduct).not.toHaveBeenCalled();
    });

    it('should return failed result when credential has no accessToken', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        accessToken: null,
      } as unknown as CredentialDocument);

      const result = await service.publish(makeContext());

      expect(result.success).toBe(false);
    });

    it('should return failed result when createProduct returns no id', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      shopifyService.createProduct.mockResolvedValue({ id: null } as never);

      const result = await service.publish(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Failed to create Shopify product/i);
    });

    it('should throw when shopifyService.createProduct throws', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      shopifyService.createProduct.mockRejectedValue(
        new Error('Shopify API down'),
      );

      await expect(service.publish(makeContext())).rejects.toThrow(
        'Shopify API down',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should use "Untitled" when post has no label', async () => {
      const postWithoutLabel = {
        ...mockPost,
        label: undefined,
      } as unknown as PostEntity;
      credentialsService.findOne.mockResolvedValue(mockCredential);
      shopifyService.createProduct.mockResolvedValue({
        id: 'prod-789',
        onlineStoreUrl: 'https://store/products/untitled',
      } as never);

      await service.publish(makeContext({ post: postWithoutLabel }));

      expect(shopifyService.createProduct).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'Untitled',
        expect.any(String),
        expect.any(Array),
      );
    });
  });

  describe('buildPostUrl', () => {
    it('should build a valid Shopify product URL', () => {
      const url = service.buildPostUrl('my-product-handle', mockCredential);
      expect(url).toBe(
        'https://mystore.myshopify.com/products/my-product-handle',
      );
    });

    it('should handle empty shop domain gracefully', () => {
      const credNoShop = {
        ...mockCredential,
        externalHandle: '',
      } as unknown as CredentialDocument;
      const url = service.buildPostUrl('handle', credNoShop);
      expect(url).toBe('https:///products/handle');
    });
  });
});
