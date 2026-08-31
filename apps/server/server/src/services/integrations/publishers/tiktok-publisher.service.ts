import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { type CredentialDocument } from '@server/collections/credentials/schemas/credential.schema';
import { BasePublisherService } from '@server/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
} from '@server/services/integrations/publishers/interfaces/publisher.interface';
import { TIKTOK_APP_HANDOFF_SETTING } from '@server/services/integrations/publishers/interfaces/publisher.interface';
import { TiktokService } from '@server/services/integrations/tiktok/services/tiktok.service';

@Injectable()
export class TikTokPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.TIKTOK;
  readonly supportsTextOnly = false;
  readonly supportsImages = true; // Photo carousel (2-35 images)
  readonly supportsVideos = true;
  readonly supportsCarousel = true; // Required for images (2-35)
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly tiktokService: TiktokService,
  ) {
    super(configService, logger);
  }

  private getPublishResponseData(response: unknown): {
    isPending?: boolean;
    postId?: string;
    publishId?: string;
  } {
    if (
      response === null ||
      typeof response !== 'object' ||
      !('data' in response) ||
      response.data === null ||
      typeof response.data !== 'object'
    ) {
      return {};
    }

    const data = response.data as {
      isPending?: unknown;
      post_id?: unknown;
      publish_id?: unknown;
    };

    return {
      isPending: data.isPending === true ? true : undefined,
      postId: typeof data.post_id === 'string' ? data.post_id : undefined,
      publishId:
        typeof data.publish_id === 'string' ? data.publish_id : undefined,
    };
  }

  /**
   * Override validation for TikTok-specific requirements
   */
  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    // First do base validation
    const baseValidation = super.validatePost(context, mediaInfo);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // TikTok requires 2-35 images for photo posts (carousel mode only)
    if (mediaInfo.isImagePost && !mediaInfo.isCarousel) {
      return {
        error: 'TikTok requires 2-35 images for photo posts (carousel mode)',
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Publish a post to TikTok
   */
  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential, organizationId, brandId, isDraft } = context;
    const mediaInfo = this.extractMediaInfo(post);
    const shouldHandoffToTikTokApp =
      context.settings[TIKTOK_APP_HANDOFF_SETTING] === true;

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

    if (shouldHandoffToTikTokApp && mediaInfo.isImagePost) {
      return this.createFailedResult(
        this.platform,
        'Publish via TikTok App is only available for TikTok videos.',
        'tiktok_app_video_required',
      );
    }

    try {
      let tiktokRes: unknown;

      if (shouldHandoffToTikTokApp) {
        tiktokRes = await this.tiktokService.uploadVideoToInbox(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          credential.id,
        );
      } else if (mediaInfo.isImagePost) {
        // TikTok photo carousel (2-35 images)
        tiktokRes = await this.tiktokService.uploadImage(
          organizationId,
          brandId,
          mediaInfo.mediaUrls,
          post,
          isDraft,
          context.settings,
          credential.id,
        );
      } else {
        // Video upload
        tiktokRes = await this.tiktokService.uploadVideo(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          post,
          context.settings,
          credential.id,
        );
      }

      const responseData = this.getPublishResponseData(tiktokRes);
      const postId = responseData.postId;
      const publishId = responseData.publishId;
      const isPending = responseData.isPending || !postId;

      if (shouldHandoffToTikTokApp && publishId) {
        this.logger.log(`${url} video sent to the creator's TikTok Inbox`, {
          postId: context.postId,
          publishId,
        });
        return {
          executionState: TargetExecutionState.PUBLISHING,
          externalId: publishId,
          platform: this.platform,
          success: true,
          url: '',
        };
      }

      // Handle pending state (TikTok moderation in progress)
      if (isPending && publishId) {
        this.logger.log(`${url} post submitted, awaiting TikTok verification`, {
          postId: context.postId,
          publishId,
        });

        return {
          externalId: publishId, // Store publish_id temporarily
          platform: this.platform,
          executionState: TargetExecutionState.PUBLISHING,
          success: true,
          url: '', // URL not available until post_id is known
        };
      }

      // No post_id and no publish_id - actual failure
      if (!postId) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID or publish ID',
        );
      }

      // Immediate success - post_id available
      const postUrl = this.buildPostUrl(postId, credential);
      return this.createSuccessResult(postId, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  /**
   * Build TikTok post URL
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return `https://www.tiktok.com/@${credential.externalHandle}/video/${externalId}`;
  }
}
