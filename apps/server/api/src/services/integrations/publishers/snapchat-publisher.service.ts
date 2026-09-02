import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
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
  ) {
    super(configService, logger);
  }

  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
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

    // This override skips super.validatePost; Snapchat has no catalog entry
    // today, so this is a no-op until one exists.
    return this.validateCaptionLength(context);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential } = context;
    const mediaInfo = this.extractMediaInfo(post);

    this.logPublishAttempt(context, mediaInfo);

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
      const snapchatCredential = credential;

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
