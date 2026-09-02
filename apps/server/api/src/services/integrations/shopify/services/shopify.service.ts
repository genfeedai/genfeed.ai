import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  IShopifyProduct,
  IShopifyProductCreateResponse,
  IShopifyProductQueryResponse,
  IShopifyProductUpdateResponse,
  IShopifyTokenResponse,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const SHOPIFY_SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/;

export function normalizeShopifyShopDomain(value: string): string {
  const shop = value.trim().toLowerCase();

  if (!SHOPIFY_SHOP_DOMAIN_PATTERN.test(shop)) {
    throw new TypeError('shop must be a valid *.myshopify.com domain');
  }

  return shop;
}

@Injectable()
export class ShopifyService {
  private readonly constructorName = String(this.constructor.name);
  private readonly apiVersion = '2024-10';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  public generateAuthUrl(shop: string, state: string): string {
    const normalizedShop = normalizeShopifyShopDomain(shop);
    const clientId = this.configService.get('SHOPIFY_CLIENT_ID');
    const redirectUri = this.configService.get('SHOPIFY_REDIRECT_URI');
    const scopes = 'write_products,read_products';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    } as Record<string, string>);
    return `https://${normalizedShop}/admin/oauth/authorize?${params.toString()}`;
  }

  public async exchangeCodeForToken(
    shop: string,
    code: string,
  ): Promise<{ accessToken: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const normalizedShop = normalizeShopifyShopDomain(shop);
      const clientId = this.configService.get('SHOPIFY_CLIENT_ID');
      const clientSecret = this.configService.get('SHOPIFY_CLIENT_SECRET');

      const response = await firstValueFrom(
        this.httpService.post<IShopifyTokenResponse>(
          `https://${normalizedShop}/admin/oauth/access_token`,
          {
            client_id: clientId,
            client_secret: clientSecret,
            code,
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        scope: response.data.scope,
        shop: normalizedShop,
      });

      return {
        accessToken: response.data.access_token,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async verifyToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        // Validation is what decides whether this account is connected, so
        // it has to be able to read a row that currently says it is not.
        isDisconnectedIncluded: true,
        organizationId,
        platform: CredentialPlatform.SHOPIFY,
      });

      if (!credential?.accessToken || !credential?.externalHandle) {
        return false;
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const shop = normalizeShopifyShopDomain(credential.externalHandle);

      // Verify by making a simple GraphQL query
      const query = `{ shop { name } }`;

      await firstValueFrom(
        this.httpService.post(
          `https://${shop}/admin/api/${this.apiVersion}/graphql.json`,
          { query },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': decryptedAccessToken,
            },
          },
        ),
      );

      this.loggerService.log(`${url} token verified`, {
        credentialId: credential.id,
        shop,
      });

      return true;
    } catch (error: unknown) {
      this.loggerService.error(`${url} token verification failed`, error);
      return false;
    }
  }

  public async createProduct(
    shop: string,
    accessToken: string,
    title: string,
    bodyHtml: string,
    images: string[],
    variants?: Array<{ price: string; title?: string }>,
    tags?: string[],
  ): Promise<IShopifyProduct | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const normalizedShop = normalizeShopifyShopDomain(shop);
      const imageInputs = images
        .map((src) => `{ src: ${JSON.stringify(src)} }`)
        .join(', ');
      const variantInputs = variants
        ? variants
            .map(
              (v) =>
                `{ price: ${JSON.stringify(v.price)}${v.title ? `, title: ${JSON.stringify(v.title)}` : ''} }`,
            )
            .join(', ')
        : '';
      const tagsString = tags ? tags.join(', ') : '';

      const mutation = `
        mutation {
          productCreate(input: {
            title: ${JSON.stringify(title)}
            bodyHtml: ${JSON.stringify(bodyHtml)}
            ${images.length > 0 ? `images: [${imageInputs}]` : ''}
            ${variantInputs ? `variants: [${variantInputs}]` : ''}
            ${tagsString ? `tags: ${JSON.stringify(tagsString)}` : ''}
          }) {
            product {
              id
              title
              handle
              onlineStoreUrl
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await firstValueFrom(
        this.httpService.post<IShopifyProductCreateResponse>(
          `https://${normalizedShop}/admin/api/${this.apiVersion}/graphql.json`,
          { query: mutation },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
          },
        ),
      );

      const result = response.data.data.productCreate;

      if (result.userErrors.length > 0) {
        this.loggerService.error(`${url} GraphQL user errors`, {
          userErrors: result.userErrors,
        });
        return null;
      }

      this.loggerService.log(`${url} success`, {
        productId: result.product?.id,
        shop: normalizedShop,
      });

      return result.product;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async updateProduct(
    shop: string,
    accessToken: string,
    productId: string,
    updates: { title?: string; bodyHtml?: string; tags?: string[] },
  ): Promise<IShopifyProduct | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const normalizedShop = normalizeShopifyShopDomain(shop);
      const inputParts: string[] = [`id: ${JSON.stringify(productId)}`];

      if (updates.title) {
        inputParts.push(`title: ${JSON.stringify(updates.title)}`);
      }
      if (updates.bodyHtml) {
        inputParts.push(`bodyHtml: ${JSON.stringify(updates.bodyHtml)}`);
      }
      if (updates.tags) {
        inputParts.push(`tags: ${JSON.stringify(updates.tags.join(', '))}`);
      }

      const mutation = `
        mutation {
          productUpdate(input: {
            ${inputParts.join('\n            ')}
          }) {
            product {
              id
              title
              handle
              onlineStoreUrl
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await firstValueFrom(
        this.httpService.post<IShopifyProductUpdateResponse>(
          `https://${normalizedShop}/admin/api/${this.apiVersion}/graphql.json`,
          { query: mutation },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
          },
        ),
      );

      const result = response.data.data.productUpdate;

      if (result.userErrors.length > 0) {
        this.loggerService.error(`${url} GraphQL user errors`, {
          userErrors: result.userErrors,
        });
        return null;
      }

      this.loggerService.log(`${url} success`, {
        productId: result.product?.id,
        shop: normalizedShop,
      });

      return result.product;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getProduct(
    shop: string,
    accessToken: string,
    productId: string,
  ): Promise<IShopifyProduct | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const normalizedShop = normalizeShopifyShopDomain(shop);
      const query = `
        query {
          product(id: ${JSON.stringify(productId)}) {
            id
            title
            handle
            onlineStoreUrl
          }
        }
      `;

      const response = await firstValueFrom(
        this.httpService.post<IShopifyProductQueryResponse>(
          `https://${normalizedShop}/admin/api/${this.apiVersion}/graphql.json`,
          { query },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        productId,
        shop: normalizedShop,
      });

      return response.data.data.product;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
