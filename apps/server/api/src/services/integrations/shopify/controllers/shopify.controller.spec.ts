vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopifyController } from './shopify.controller';

vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

describe('ShopifyController', () => {
  let controller: ShopifyController;

  const mockShopifyService = {
    createProduct: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const mockBrandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
  };
  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'credential-id' },
      state: 'opaque-oauth-state',
    }),
    findPendingOAuthCredential: vi.fn().mockResolvedValue({
      brandId: 'brand-id',
      externalHandle: 'myshop.myshopify.com',
      id: 'credential-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
    connectAccount: vi.fn().mockResolvedValue({
      id: 'credential-id',
      isConnected: true,
    }),
    patch: vi.fn().mockResolvedValue({
      id: 'credential-id',
      isConnected: true,
    }),
  };
  const user = {
    organizationId: 'organization-id',
    userId: 'user-id',
  } as unknown as User;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShopifyController],
      providers: [
        { provide: ShopifyService, useValue: mockShopifyService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: CredentialsService, useValue: mockCredentialsService },
      ],
    }).compile();

    controller = module.get<ShopifyController>(ShopifyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect()', () => {
    it('should return auth URL from service', async () => {
      mockShopifyService.generateAuthUrl.mockReturnValue(
        'https://myshop.myshopify.com/admin/oauth/authorize',
      );

      const result = await controller.connect({} as never, user, {
        brandId: 'brand-id',
        shop: 'myshop.myshopify.com',
      });

      expect(result).toEqual({
        url: 'https://myshop.myshopify.com/admin/oauth/authorize',
      });
    });

    it('should pass normalized shop and server-issued state', async () => {
      mockShopifyService.generateAuthUrl.mockReturnValue(
        'https://shopify.com/auth',
      );

      await controller.connect({} as never, user, {
        brandId: 'brand-id',
        shop: 'SHOP.myshopify.com',
      });

      expect(mockShopifyService.generateAuthUrl).toHaveBeenCalledWith(
        'shop.myshopify.com',
        'opaque-oauth-state',
      );
    });

    it('should log auth url request', async () => {
      mockShopifyService.generateAuthUrl.mockReturnValue(
        'https://shopify.com/auth',
      );

      await controller.connect({} as never, user, {
        brandId: 'brand-id',
        shop: 'shop.myshopify.com',
      });

      expect(mockLoggerService.log).toHaveBeenCalledWith('Shopify auth url');
    });

    it('should reject an invalid shop domain', async () => {
      await expect(
        controller.connect({} as never, user, {
          brandId: 'brand-id',
          shop: 'internal.example.com',
        }),
      ).rejects.toThrow(/myshopify/);
    });
  });

  describe('verify()', () => {
    it('should persist token data from service', async () => {
      const tokenResult = { accessToken: 'shpua_abc123' };
      mockShopifyService.exchangeCodeForToken.mockResolvedValue(tokenResult);

      const result = await controller.verify({} as never, {
        code: 'auth-code',
        state: 'opaque-oauth-state',
      });

      expect(mockCredentialsService.connectAccount).toHaveBeenCalledWith(
        'credential-id',
        'organization-id',
        {
          handle: 'myshop.myshopify.com',
          id: 'myshop.myshopify.com',
          name: 'myshop.myshopify.com',
        },
        { accessToken: 'shpua_abc123' },
      );
      expect(result).toEqual({ id: 'credential-id', isConnected: true });
    });

    it('should use the shop bound to the pending credential', async () => {
      mockShopifyService.exchangeCodeForToken.mockResolvedValue({
        accessToken: 'token',
      });

      await controller.verify({} as never, {
        code: 'my-code',
        state: 'opaque-oauth-state',
      });

      expect(mockShopifyService.exchangeCodeForToken).toHaveBeenCalledWith(
        'myshop.myshopify.com',
        'my-code',
      );
    });

    it('should log exchange token request', async () => {
      mockShopifyService.exchangeCodeForToken.mockResolvedValue({
        accessToken: 'token',
      });

      await controller.verify({} as never, {
        code: 'code',
        state: 'opaque-oauth-state',
      });

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Shopify exchange token',
      );
    });
  });

  describe('createProduct()', () => {
    const productBody = {
      accessToken: 'shpua_token',
      bodyHtml: '<p>Product description</p>',
      images: ['https://example.com/img.jpg'],
      shop: 'myshop.myshopify.com',
      tags: ['ai', 'generated'],
      title: 'AI Generated Product',
      variants: [{ price: '29.99', title: 'Default' }],
    };

    it('should return created product from service', async () => {
      const product = { id: 12345, title: 'AI Generated Product' };
      mockShopifyService.createProduct.mockResolvedValue(product);

      const result = await controller.createProduct(productBody);

      expect(result).toEqual({ data: product });
    });

    it('should pass all args to createProduct service', async () => {
      mockShopifyService.createProduct.mockResolvedValue({});

      await controller.createProduct(productBody);

      expect(mockShopifyService.createProduct).toHaveBeenCalledWith(
        productBody.shop,
        productBody.accessToken,
        productBody.title,
        productBody.bodyHtml,
        productBody.images,
        productBody.variants,
        productBody.tags,
      );
    });

    it('should log create product request', async () => {
      mockShopifyService.createProduct.mockResolvedValue({});

      await controller.createProduct(productBody);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Shopify create product',
      );
    });

    it('should propagate service errors', async () => {
      mockShopifyService.createProduct.mockRejectedValue(
        new Error('Shopify API error'),
      );

      await expect(controller.createProduct(productBody)).rejects.toThrow(
        'Shopify API error',
      );
    });
  });
});
