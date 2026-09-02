import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { readChannelSettingString } from '@api-types/contracts/channel-capabilities.contract';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
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
  ) {
    super(configService, logger);
  }

  /**
   * Override validation for Pinterest-specific requirements
   */
  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
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

    // This override skips super.validatePost, so the catalog length
    // backstop must run explicitly.
    return this.validateCaptionLength(context);
  }

  /**
   * Publish a pin to Pinterest
   */
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
      const pinterestCredential = credential;

      // The explicit board setting wins; the credential's board is the
      // fallback for releases scheduled before the setting existed.
      const boardId =
        readChannelSettingString(context.settings, 'boardId') ??
        pinterestCredential?.externalId;

      if (!pinterestCredential?.accessToken || !boardId) {
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
        boardId,
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
