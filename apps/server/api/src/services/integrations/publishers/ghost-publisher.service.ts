import { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GhostPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.GHOST;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly ghostService: GhostService,
    private readonly credentialsService: CredentialsService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to Ghost as a blog post.
   * Uses post.description as HTML content and post.label as title.
   * If media is present, the first image is used as the featured image.
   */
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
      // Get Ghost credential with API key
      const ghostCredential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.GHOST,
      });

      if (!ghostCredential?.accessToken || !ghostCredential?.externalHandle) {
        this.logger.error(`${url} Ghost credential or site URL not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Ghost credential or site URL not found',
        );
      }

      const decryptedApiKey = EncryptionUtil.decrypt(
        ghostCredential.accessToken,
      );
      const ghostUrl = ghostCredential.externalHandle;

      // Ghost supports HTML content natively
      const htmlContent = post.description || '<p></p>';
      const title = post.label ?? 'Untitled';
      const status = context.isDraft ? 'draft' : 'published';

      // Use first image as featured image if media is present
      const featureImage =
        mediaInfo.hasIngredients && mediaInfo.isImagePost
          ? mediaInfo.mediaUrls[0]
          : undefined;

      const ghostPost = await this.ghostService.createPost(
        ghostUrl,
        decryptedApiKey,
        title,
        htmlContent,
        status,
        featureImage,
      );

      if (!ghostPost?.id) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Ghost',
        );
      }

      // Ghost returns the post URL directly
      const postUrl =
        ghostPost.url || this.buildPostUrl(ghostPost.id, credential);
      return this.createSuccessResult(ghostPost.id, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  /**
   * Build Ghost post URL as fallback when API does not return one.
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    const ghostUrl = credential.externalHandle || '';
    return `${ghostUrl}/p/${externalId}`;
  }
}
