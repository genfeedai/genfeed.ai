import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WordpressPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.WORDPRESS;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly wordpressService: WordpressService,
  ) {
    super(configService, logger);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential } = context;
    const mediaInfo = this.extractMediaInfo(post);

    // Log the attempt
    this.logPublishAttempt(context, mediaInfo);

    // Validate
    const validation = this.validatePost(context, mediaInfo);
    if (!validation.valid) {
      return this.createFailedResult(
        this.platform,
        validation.error,
        validation.errorCode,
      );
    }

    try {
      // The account this post was scheduled for, already resolved by the
      // publish pipeline. Re-resolving it from brand + platform would hand the
      // post to a sibling account the moment the brand connects a second one.
      const wordpressCredential = credential;

      if (
        !wordpressCredential?.accessToken ||
        !wordpressCredential?.externalId
      ) {
        this.logger.error(`${url} WordPress credential or site ID not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'WordPress credential or site ID not found',
        );
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        wordpressCredential.accessToken,
      );

      // WordPress supports HTML natively, use description as-is
      const content = post.description || '';
      const title = post.label ?? 'Untitled';

      // If the post has an image, include it as featured image
      const featuredImage =
        mediaInfo.hasIngredients && mediaInfo.isImagePost
          ? mediaInfo.mediaUrls[0]
          : undefined;

      const externalId = await this.wordpressService.createPost(
        decryptedAccessToken,
        wordpressCredential.externalId, // siteId stored in externalId
        title,
        content,
        context.isDraft ? 'draft' : 'publish',
        undefined, // categories
        undefined, // tags
        featuredImage,
      );

      if (!externalId) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID',
        );
      }

      const postUrl = this.buildPostUrl(externalId, credential);
      return this.createSuccessResult(externalId, this.platform, postUrl);
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
    // externalHandle stores the site domain (e.g., "mysite.wordpress.com")
    const siteDomain = credential.externalHandle || 'wordpress.com';
    return `https://${siteDomain}/?p=${externalId}`;
  }
}
