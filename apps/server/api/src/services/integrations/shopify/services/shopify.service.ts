import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type {
  IShopifyProduct,
  IShopifyProductCreateResponse,
  IShopifyProductQueryResponse,
  IShopifyProductUpdateResponse,
  IShopifyTokenResponse,
} from '@genfeedai/interfaces';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

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
    const clientId = this.configService.get('SHOPIFY_CLIENT_ID');
    const redirectUri = this.configService.get('SHOPIFY_REDIRECT_URI');
    const scopes = 'write_products,read_products';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    } as Record<string, string>);
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  public async exchangeCodeForToken(
    shop: string,
    code: string,
  ): Promise<{ accessToken: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const clientId = this.configService.get('SHOPIFY_CLIENT_ID');
      const clientSecret = this.configService.get('SHOPIFY_CLIENT_SECRET');

      const response = await firstValueFrom(
        this.httpService.post<IShopifyTokenResponse>(
          `https://${shop}/admin/oauth/access_token`,
          {
            client_id: clientId,
            client_secret: clientSecret,
            code,
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        scope: response.data.scope,
        shop,
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
  ): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.SHOPIFY,
      });

      if (!credential?.accessToken || !credential?.externalHandle) {
        return false;
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const shop = credential.externalHandle;

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
        credentialId: credential._id,
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
      const imageInputs = images.map((src) => `{ src: "${src}" }`).join(', ');
      const variantInputs = variants
        ? variants
            .map(
              (v) =>
                `{ price: "${v.price}"${v.title ? `, title: "${v.title}"` : ''} }`,
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
          `https://${shop}/admin/api/${this.apiVersion}/graphql.json`,
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
        shop,
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
          `https://${shop}/admin/api/${this.apiVersion}/graphql.json`,
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
        shop,
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
          `https://${shop}/admin/api/${this.apiVersion}/graphql.json`,
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
        shop,
      });

      return response.data.data.product;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
