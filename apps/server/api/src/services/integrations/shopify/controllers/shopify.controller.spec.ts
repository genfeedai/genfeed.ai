vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: (_request: unknown, _serializer: unknown, data: unknown) =>
    data,
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ShopifyController } from './shopify.controller';

vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

interface StoredCredential {
  accessToken?: string;
  account?: { handle: string; id: string; name: string };
  brandId: string;
  externalHandle: string;
  id: string;
  isConnected: boolean;
  oauthState: string | null;
  organizationId: string;
  platform: string;
  userId: string;
}

interface ProductRequest {
  accessToken: string;
  bodyHtml: string;
  images: string[];
  shop: string;
  tags?: string[];
  title: string;
  variants?: Array<{ price: string; title?: string }>;
}

/** Shopify's OAuth server: the code each shop accepts and the token it issues. */
const SHOPIFY_TOKENS: Record<string, { accessToken?: string }> = {
  'myshop.myshopify.com:auth-code': { accessToken: 'shpua_abc123' },
  'myshop.myshopify.com:code-without-token': {},
};

function setup() {
  const brands = [
    { id: 'brand-id', organizationId: 'organization-id', userId: 'user-id' },
  ];
  const credentials: StoredCredential[] = [];
  const products: ProductRequest[] = [];
  let isShopifyDown = false;

  const brandsService = {
    findOne: async (filter: { id: string; organizationId: string }) =>
      brands.find(
        (brand) =>
          brand.id === filter.id &&
          brand.organizationId === filter.organizationId,
      ) ?? null,
  } as unknown as BrandsService;

  const credentialsService = {
    beginOAuthForBrand: async (
      brand: { id: string; organizationId: string },
      userId: string,
      platform: string,
      fields: { externalHandle: string },
    ) => {
      const credential: StoredCredential = {
        brandId: brand.id,
        externalHandle: fields.externalHandle,
        id: `credential-${credentials.length + 1}`,
        isConnected: false,
        oauthState: `state-${credentials.length + 1}`,
        organizationId: brand.organizationId,
        platform,
        userId,
      };
      credentials.push(credential);
      return { credential, state: credential.oauthState };
    },
    connectAccount: async (
      id: string,
      organizationId: string,
      account: StoredCredential['account'],
      tokens: { accessToken: string },
    ) => {
      const credential = credentials.find(
        (item) => item.id === id && item.organizationId === organizationId,
      );
      if (!credential) throw new Error(`no credential ${id}`);
      Object.assign(credential, {
        account,
        accessToken: tokens.accessToken,
        isConnected: true,
        oauthState: null,
      });
      return { ...credential };
    },
    findPendingOAuthCredential: async (state: string, platform: string) =>
      credentials.find(
        (credential) =>
          credential.oauthState === state && credential.platform === platform,
      ) ?? null,
  } as unknown as CredentialsService;

  const shopifyService = {
    createProduct: async (
      shop: string,
      accessToken: string,
      title: string,
      bodyHtml: string,
      images: string[],
      variants?: ProductRequest['variants'],
      tags?: string[],
    ) => {
      if (isShopifyDown) throw new Error('Shopify API error');
      products.push({
        accessToken,
        bodyHtml,
        images,
        shop,
        tags,
        title,
        variants,
      });
      return { id: 12345, title };
    },
    exchangeCodeForToken: async (shop: string, code: string) => {
      const tokens = SHOPIFY_TOKENS[`${shop}:${code}`];
      if (!tokens) throw new Error('Invalid code');
      return tokens;
    },
    generateAuthUrl: (shop: string, state: string) =>
      `https://${shop}/admin/oauth/authorize?state=${state}`,
  } as unknown as ShopifyService;

  const logger = {
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as unknown as LoggerService;

  const controller = new ShopifyController(
    shopifyService,
    logger,
    brandsService,
    credentialsService,
  );
  return {
    controller,
    credentials,
    products,
    setShopifyDown: () => {
      isShopifyDown = true;
    },
  };
}

const request = {} as Request;
const user = {
  organizationId: 'organization-id',
  userId: 'user-id',
} as unknown as User;

describe('ShopifyController', () => {
  describe('connect()', () => {
    it('opens a pending credential for the normalized shop and returns its auth URL', async () => {
      const { controller, credentials } = setup();

      const result = await controller.connect(request, user, {
        brandId: 'brand-id',
        shop: 'MYSHOP.myshopify.com',
      });

      expect(result).toEqual({
        url: 'https://myshop.myshopify.com/admin/oauth/authorize?state=state-1',
      });
      expect(credentials).toEqual([
        expect.objectContaining({
          brandId: 'brand-id',
          externalHandle: 'myshop.myshopify.com',
          isConnected: false,
          oauthState: 'state-1',
          platform: 'shopify',
        }),
      ]);
    });

    it('rejects a shop domain outside myshopify.com', async () => {
      const { controller, credentials } = setup();

      await expect(
        controller.connect(request, user, {
          brandId: 'brand-id',
          shop: 'internal.example.com',
        }),
      ).rejects.toThrow(/myshopify/);
      expect(credentials).toEqual([]);
    });

    it('refuses a brand outside the caller organization', async () => {
      const { controller, credentials } = setup();

      await expect(
        controller.connect(
          request,
          { ...user, organizationId: 'other-org' } as User,
          { brandId: 'brand-id', shop: 'myshop.myshopify.com' },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(credentials).toEqual([]);
    });
  });

  describe('verify()', () => {
    it('connects the pending credential with the token for the shop it was opened for', async () => {
      const { controller, credentials } = setup();
      await controller.connect(request, user, {
        brandId: 'brand-id',
        shop: 'myshop.myshopify.com',
      });

      const result = await controller.verify(request, {
        code: 'auth-code',
        state: 'state-1',
      });

      expect(result).toMatchObject({
        accessToken: 'shpua_abc123',
        account: {
          handle: 'myshop.myshopify.com',
          id: 'myshop.myshopify.com',
          name: 'myshop.myshopify.com',
        },
        id: 'credential-1',
        isConnected: true,
      });
      expect(credentials[0]).toMatchObject({
        isConnected: true,
        oauthState: null,
      });
    });

    it('rejects a state that no pending credential carries', async () => {
      const { controller } = setup();

      await expect(
        controller.verify(request, { code: 'auth-code', state: 'forged' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('fails with 502 and leaves the credential pending when Shopify returns no token', async () => {
      const { controller, credentials } = setup();
      await controller.connect(request, user, {
        brandId: 'brand-id',
        shop: 'myshop.myshopify.com',
      });

      await expect(
        controller.verify(request, {
          code: 'code-without-token',
          state: 'state-1',
        }),
      ).rejects.toMatchObject({ status: 502 });
      expect(credentials[0]).toMatchObject({ isConnected: false });
    });
  });

  describe('createProduct()', () => {
    const productBody: ProductRequest = {
      accessToken: 'shpua_token',
      bodyHtml: '<p>Product description</p>',
      images: ['https://example.com/img.jpg'],
      shop: 'myshop.myshopify.com',
      tags: ['ai', 'generated'],
      title: 'AI Generated Product',
      variants: [{ price: '29.99', title: 'Default' }],
    };

    it('creates the product in the shop and returns it', async () => {
      const { controller, products } = setup();

      const result = await controller.createProduct(productBody);

      expect(result).toEqual({
        data: { id: 12345, title: 'AI Generated Product' },
      });
      expect(products).toEqual([productBody]);
    });

    it('propagates Shopify errors', async () => {
      const { controller, products, setShopifyDown } = setup();
      setShopifyDown();

      await expect(controller.createProduct(productBody)).rejects.toThrow(
        'Shopify API error',
      );
      expect(products).toEqual([]);
    });
  });
});
