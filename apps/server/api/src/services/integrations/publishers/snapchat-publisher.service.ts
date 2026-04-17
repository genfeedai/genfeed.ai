import { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SnapchatPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.SNAPCHAT;
  readonly supportsTextOnly = false;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly snapchatService: SnapchatService,
    private readonly credentialsService: CredentialsService,
  ) {
    super(configService, logger);
  }

  override validatePost(
    _context: PublishContext,
    mediaInfo: MediaInfo,
  ): { valid: boolean; error?: string } {
    if (!mediaInfo.hasIngredients) {
      return {
        error: 'Snapchat requires media (image or video)',
        valid: false,
      };
    }

    if (mediaInfo.isCarousel) {
      return {
        error: 'Snapchat does not support carousel posts',
        valid: false,
      };
    }

    return { valid: true };
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential, organizationId, brandId } = context;
    const mediaInfo = this.extractMediaInfo(post);

    this.logPublishAttempt(context, mediaInfo);

    const validation = this.validatePost(context, mediaInfo);
    if (!validation.valid) {
      return this.createFailedResult(this.platform, validation.error);
    }

    try {
      const snapchatCredential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.SNAPCHAT,
      });

      if (!snapchatCredential?.accessToken || !snapchatCredential?.externalId) {
        this.logger.error(
          `${url} Snapchat credential or ad account ID not found`,
          {
            postId: context.postId,
          },
        );
        return this.createFailedResult(
          this.platform,
          'Snapchat credential or ad account ID not found',
        );
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        snapchatCredential.accessToken,
      );

      const mediaType = mediaInfo.isImagePost ? 'IMAGE' : 'VIDEO';

      const mediaId = await this.snapchatService.createMedia(
        decryptedAccessToken,
        snapchatCredential.externalId,
        mediaInfo.mediaUrls[0],
        post.label ?? 'Untitled',
        mediaType,
      );

      if (!mediaId) {
        return this.createFailedResult(
          this.platform,
          'Failed to upload media to Snapchat',
        );
      }

      const description = this.sanitizeDescription(post.description);

      const externalId = await this.snapchatService.publishStory(
        decryptedAccessToken,
        snapchatCredential.externalId,
        mediaId,
        description || undefined,
      );

      if (!externalId) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Snapchat',
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
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return `https://www.snapchat.com/spotlight/${externalId}`;
  }
}
