import { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ShopifyPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.SHOPIFY;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = true;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly shopifyService: ShopifyService,
    private readonly credentialsService: CredentialsService,
  ) {
    super(configService, logger);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential, organizationId, brandId } = context;
    const mediaInfo = this.extractMediaInfo(post);

    // Log the attempt
    this.logPublishAttempt(context, mediaInfo);

    // Validate
    const validation = this.validatePost(context, mediaInfo);
    if (!validation.valid) {
      return this.createFailedResult(this.platform, validation.error);
    }

    try {
      const shopifyCredential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.SHOPIFY,
      });

      if (
        !shopifyCredential?.accessToken ||
        !shopifyCredential?.externalHandle
      ) {
        this.logger.error(
          `${url} Shopify credential or shop domain not found`,
          {
            postId: context.postId,
          },
        );
        return this.createFailedResult(
          this.platform,
          'Shopify credential or shop domain not found',
        );
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        shopifyCredential.accessToken,
      );
      const shop = shopifyCredential.externalHandle;

      // Use post label as product title, description as bodyHtml
      const title = post.label ?? 'Untitled';
      const bodyHtml = post.description ?? '';

      // Use media URLs as product images
      const images = mediaInfo.hasIngredients ? mediaInfo.mediaUrls : [];

      const product = await this.shopifyService.createProduct(
        shop,
        decryptedAccessToken,
        title,
        bodyHtml,
        images,
      );

      if (!product?.id) {
        return this.createFailedResult(
          this.platform,
          'Failed to create Shopify product',
        );
      }

      const postUrl = product.onlineStoreUrl
        ? product.onlineStoreUrl
        : this.buildPostUrl(product.handle, credential);

      return this.createSuccessResult(product.id, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    const shop = credential.externalHandle || '';
    return `https://${shop}/products/${externalId}`;
  }
}
