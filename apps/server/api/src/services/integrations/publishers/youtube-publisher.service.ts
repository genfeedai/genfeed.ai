import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { verifyMediaPublish } from '@api/services/integrations/publishers/publisher-media-verification.util';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/** `uploadVideo` titles a video without a label this way. */
const YOUTUBE_DEFAULT_VIDEO_TITLE = 'Genfeed.ai Video';
/** An upload YouTube accepted: still processing, or done. */
const VERIFIED_UPLOAD_STATUSES: ReadonlySet<string> = new Set([
  'processed',
  'uploaded',
]);

@Traced()
@Injectable()
export class YouTubePublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.YOUTUBE;
  readonly supportsTextOnly = false;
  readonly supportsImages = false;
  readonly supportsVideos = true;
  readonly supportsCarousel = false;
  readonly supportsThreads = true; // Supports TEXT children as first comments

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly youtubeService: YoutubeService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Override validation for YouTube-specific requirements
   */
  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    // YouTube only supports single video
    if (mediaInfo.isImagePost) {
      return {
        error: 'YouTube does not support image posts',
        valid: false,
      };
    }

    if (mediaInfo.isCarousel) {
      return {
        error: 'YouTube does not support multiple videos',
        valid: false,
      };
    }

    // YouTube requires scheduled date
    if (!context.post.scheduledDate) {
      return {
        error: 'YouTube requires a scheduled date',
        valid: false,
      };
    }

    // The catalog caption limit applies to the video description that
    // `uploadVideo` sends (the title comes from `post.label` and has no
    // catalog entry). This override skips super.validatePost, so the
    // length backstop must run explicitly.
    return this.validateCaptionLength(context);
  }

  /**
   * Whether an earlier, unconfirmed upload landed on the channel.
   *
   * Matches the exact title and description among the channel's uploads since
   * the attempt began. A video still processing counts as landed (it exists and
   * has its id). One YouTube reports as failed, rejected or deleted stays
   * unknown. The thumbnail and playlist steps that follow an upload are not
   * replayed, so a verified video can lack them.
   */
  async verifyPublished(
    context: PublishContext,
    attemptStartedAt: Date,
  ): Promise<PublishResult | null> {
    const mediaInfo = this.extractMediaInfo(context.post);
    if (mediaInfo.isImagePost || mediaInfo.isCarousel) {
      throw new Error('Provider verification lacks exact video proof');
    }
    if (!context.credential.externalId) {
      throw new Error('YouTube verification channel unavailable or changed');
    }
    const found = await verifyMediaPublish(
      attemptStartedAt,
      (cursor) =>
        this.youtubeService.listPublishVerificationPage(
          context.organizationId,
          context.brandId,
          context.credential.id,
          context.credential.externalId,
          attemptStartedAt,
          cursor,
        ),
      {
        mediaCount: 1,
        mediaKind: 'video',
        text: htmlToText(context.post.description),
        title: context.post.label || YOUTUBE_DEFAULT_VIDEO_TITLE,
      },
    );
    if (!found) return null;
    if (!VERIFIED_UPLOAD_STATUSES.has(found.status ?? '')) {
      throw new Error('YouTube verification found an upload that did not land');
    }
    return this.createSuccessResult(
      found.id,
      this.platform,
      this.buildPostUrl(found.id, context.credential),
    );
  }

  /**
   * Publish a video to YouTube
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
      return this.createFailedResult(
        this.platform,
        validation.error,
        validation.errorCode,
      );
    }

    try {
      const externalId = await this.youtubeService.uploadVideo(
        organizationId,
        brandId,
        mediaInfo.ingredientIds[0],
        post,
        context.settings,
        credential.id,
      );

      if (!externalId) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID',
        );
      }

      this.logger.log(`${url} YouTube video uploaded with ID: ${externalId}`);

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
   * Build YouTube video URL
   */
  buildPostUrl(
    externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return `https://www.youtube.com/watch?v=${externalId}`;
  }

  /**
   * Publish TEXT children as comments on the YouTube video
   * For YouTube, "thread children" are posted as comments on the main video
   */
  async publishThreadChildren(
    context: PublishContext,
    children: ThreadChild[],
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { organizationId, brandId } = context;
    return this.publishChildrenAsComments({
      children,
      context,
      logPrefix: url,
      parentExternalId,
      publishComment: (text) =>
        this.youtubeService.postComment(
          organizationId,
          brandId,
          parentExternalId,
          text,
          // Comments go out as the channel that uploaded the video.
          context.credential.id,
        ),
      updateChild: (childId, update) =>
        this.postsService.patch(childId, update),
    });
  }
}
