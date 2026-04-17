vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => `decrypted:${val}`) },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('ShopifyService', () => {
  let service: ShopifyService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  const shop = 'test-store.myshopify.com';
  const accessToken = 'shpat_token123';
  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();

  beforeEach(async () => {
    vi.clearAllMocks();

    configService = {
      get: vi.fn((key: string) => {
        const cfg: Record<string, string> = {
          SHOPIFY_CLIENT_ID: 'client_id_123',
          SHOPIFY_CLIENT_SECRET: 'client_secret_xyz',
          SHOPIFY_REDIRECT_URI: 'https://app.genfeed.ai/oauth/shopify',
        };
        return cfg[key];
      }),
    };

    credentialsService = { findOne: vi.fn() };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyService,
        { provide: ConfigService, useValue: configService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerService },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get(ShopifyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('returns a valid Shopify OAuth URL', () => {
      const url = service.generateAuthUrl(shop, 'state-abc');

      expect(url).toContain(`https://${shop}/admin/oauth/authorize`);
      expect(url).toContain('client_id=client_id_123');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=write_products');
      expect(url).toContain('state=state-abc');
    });

    it('includes read_products scope', () => {
      const url = service.generateAuthUrl(shop, 'state-xyz');
      expect(url).toContain('read_products');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('returns access token on success', async () => {
      httpService.post.mockReturnValue(
        of({ data: { access_token: 'shpat_new', scope: 'write_products' } }),
      );

      const result = await service.exchangeCodeForToken(shop, 'auth-code-123');

      expect(result).toEqual({ accessToken: 'shpat_new' });
      expect(httpService.post).toHaveBeenCalledWith(
        `https://${shop}/admin/oauth/access_token`,
        expect.objectContaining({
          client_id: 'client_id_123',
          client_secret: 'client_secret_xyz',
          code: 'auth-code-123',
        }),
      );
    });

    it('throws and logs error on HTTP failure', async () => {
      const err = new Error('Network error');
      httpService.post.mockReturnValue(throwError(() => err));

      await expect(
        service.exchangeCodeForToken(shop, 'bad-code'),
      ).rejects.toThrow('Network error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('verifyToken', () => {
    const mockCredential = {
      _id: new Types.ObjectId(),
      accessToken: 'encrypted_token',
      externalHandle: shop,
    };

    it('returns true when GraphQL query succeeds', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      httpService.post.mockReturnValue(
        of({ data: { data: { shop: { name: 'Test' } } } }),
      );

      const result = await service.verifyToken(orgId, brandId);

      expect(result).toBe(true);
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted_token');
      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ platform: CredentialPlatform.SHOPIFY }),
      );
    });

    it('returns false when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      const result = await service.verifyToken(orgId, brandId);
      expect(result).toBe(false);
    });

    it('returns false when accessToken is missing', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        accessToken: null,
      });

      const result = await service.verifyToken(orgId, brandId);
      expect(result).toBe(false);
    });

    it('returns false when externalHandle is missing', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...mockCredential,
        externalHandle: null,
      });

      const result = await service.verifyToken(orgId, brandId);
      expect(result).toBe(false);
    });

    it('returns false and logs on HTTP error', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential);
      httpService.post.mockReturnValue(
        throwError(() => new Error('Unauthorized')),
      );

      const result = await service.verifyToken(orgId, brandId);
      expect(result).toBe(false);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('createProduct', () => {
    const productResponse = {
      handle: 'test-product',
      id: 'gid://shopify/Product/123',
      onlineStoreUrl: 'https://test.myshopify.com/products/test-product',
      title: 'Test Product',
    };

    it('returns product on success', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            data: {
              productCreate: { product: productResponse, userErrors: [] },
            },
          },
        }),
      );

      const result = await service.createProduct(
        shop,
        accessToken,
        'Test Product',
        '<p>Description</p>',
        ['https://img.example.com/img.jpg'],
        [{ price: '9.99', title: 'Default' }],
        ['tag1', 'tag2'],
      );

      expect(result).toEqual(productResponse);
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('returns null on GraphQL user errors', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            data: {
              productCreate: {
                product: null,
                userErrors: [{ field: 'title', message: 'Too long' }],
              },
            },
          },
        }),
      );

      const result = await service.createProduct(
        shop,
        accessToken,
        'Title',
        'Body',
        [],
      );

      expect(result).toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('throws and logs on HTTP error', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('HTTP 500')));

      await expect(
        service.createProduct(shop, accessToken, 'T', 'B', []),
      ).rejects.toThrow('HTTP 500');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('returns updated product on success', async () => {
      const updatedProduct = {
        handle: 'updated',
        id: 'gid://shopify/Product/456',
        onlineStoreUrl: null,
        title: 'Updated',
      };
      httpService.post.mockReturnValue(
        of({
          data: {
            data: {
              productUpdate: { product: updatedProduct, userErrors: [] },
            },
          },
        }),
      );

      const result = await service.updateProduct(
        shop,
        accessToken,
        'gid://shopify/Product/456',
        {
          title: 'Updated',
        },
      );

      expect(result).toEqual(updatedProduct);
    });

    it('returns null on user errors', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            data: {
              productUpdate: {
                product: null,
                userErrors: [{ field: 'id', message: 'Not found' }],
              },
            },
          },
        }),
      );

      const result = await service.updateProduct(
        shop,
        accessToken,
        'bad-id',
        {},
      );
      expect(result).toBeNull();
    });
  });

  describe('getProduct', () => {
    it('fetches and returns product by id', async () => {
      const product = {
        handle: 'fetched',
        id: 'gid://shopify/Product/789',
        onlineStoreUrl: null,
        title: 'Fetched',
      };
      httpService.post.mockReturnValue(of({ data: { data: { product } } }));

      const result = await service.getProduct(
        shop,
        accessToken,
        'gid://shopify/Product/789',
      );

      expect(result).toEqual(product);
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('throws on HTTP error', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('Timeout')));

      await expect(
        service.getProduct(shop, accessToken, 'gid://shopify/Product/999'),
      ).rejects.toThrow('Timeout');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
