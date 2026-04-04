import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShopifyService } from '../services/shopify.service';
import { ShopifyController } from './shopify.controller';

vi.mock('../services/shopify.service');
vi.mock('@libs/logger/logger.service');
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

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShopifyController],
      providers: [
        { provide: ShopifyService, useValue: mockShopifyService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<ShopifyController>(ShopifyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAuthUrl()', () => {
    it('should return auth URL from service', () => {
      mockShopifyService.generateAuthUrl.mockReturnValue(
        'https://myshop.myshopify.com/admin/oauth/authorize',
      );

      const result = controller.getAuthUrl('myshop.myshopify.com', 'state-abc');

      expect(result).toEqual({
        data: { url: 'https://myshop.myshopify.com/admin/oauth/authorize' },
      });
    });

    it('should pass shop and state to generateAuthUrl', () => {
      mockShopifyService.generateAuthUrl.mockReturnValue(
        'https://shopify.com/auth',
      );

      controller.getAuthUrl('shop.myshopify.com', 'my-state');

      expect(mockShopifyService.generateAuthUrl).toHaveBeenCalledWith(
        'shop.myshopify.com',
        'my-state',
      );
    });

    it('should log auth url request', () => {
      mockShopifyService.generateAuthUrl.mockReturnValue(
        'https://shopify.com/auth',
      );

      controller.getAuthUrl('shop.myshopify.com', '');

      expect(mockLoggerService.log).toHaveBeenCalledWith('Shopify auth url');
    });

    it('should pass empty string when state is undefined', () => {
      mockShopifyService.generateAuthUrl.mockReturnValue(
        'https://shopify.com/auth',
      );

      controller.getAuthUrl('shop.myshopify.com', undefined as any);

      expect(mockShopifyService.generateAuthUrl).toHaveBeenCalledWith(
        'shop.myshopify.com',
        '',
      );
    });
  });

  describe('exchangeToken()', () => {
    it('should return token data from service', async () => {
      const tokenResult = {
        access_token: 'shpua_abc123',
        scope: 'read_products,write_products',
      };
      mockShopifyService.exchangeCodeForToken.mockResolvedValue(tokenResult);

      const result = await controller.exchangeToken({
        code: 'auth-code',
        shop: 'myshop.myshopify.com',
      });

      expect(result).toEqual({ data: tokenResult });
    });

    it('should pass shop and code to exchangeCodeForToken', async () => {
      mockShopifyService.exchangeCodeForToken.mockResolvedValue({});

      await controller.exchangeToken({
        code: 'my-code',
        shop: 'my-shop.myshopify.com',
      });

      expect(mockShopifyService.exchangeCodeForToken).toHaveBeenCalledWith(
        'my-shop.myshopify.com',
        'my-code',
      );
    });

    it('should log exchange token request', async () => {
      mockShopifyService.exchangeCodeForToken.mockResolvedValue({});

      await controller.exchangeToken({
        code: 'code',
        shop: 'shop.myshopify.com',
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
