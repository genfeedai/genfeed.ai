import { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PinterestPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.PINTEREST;
  readonly supportsTextOnly = false;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly pinterestService: PinterestService,
    private readonly credentialsService: CredentialsService,
  ) {
    super(configService, logger);
  }

  /**
   * Override validation for Pinterest-specific requirements
   */
  override validatePost(
    _context: PublishContext,
    mediaInfo: MediaInfo,
  ): { valid: boolean; error?: string } {
    // Pinterest only supports single images
    if (!mediaInfo.isImagePost) {
      return {
        error: 'Pinterest only supports image posts',
        valid: false,
      };
    }

    if (mediaInfo.isCarousel) {
      return {
        error: 'Pinterest does not support carousel posts',
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Publish a pin to Pinterest
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
      // Pinterest requires getting credential and board info
      const pinterestCredential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.PINTEREST,
      });

      if (
        !pinterestCredential?.accessToken ||
        !pinterestCredential?.externalId
      ) {
        this.logger.error(`${url} Pinterest credential or board ID not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Pinterest credential or board ID not found',
        );
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        pinterestCredential.accessToken,
      );

      // Sanitize HTML to plain text - Pinterest doesn't support HTML markup
      const description = this.sanitizeDescription(post.description);

      const externalId = await this.pinterestService.createPin(
        decryptedAccessToken,
        pinterestCredential.externalId, // boardId stored in externalId
        mediaInfo.mediaUrls[0],
        post.label ?? 'Untitled',
        description,
        undefined, // link
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

  /**
   * Build Pinterest pin URL
   */
  buildPostUrl(
    externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return `https://www.pinterest.com/pin/${externalId}`;
  }
}
