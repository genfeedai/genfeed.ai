import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type { ProviderMediaVerificationMatch } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  throwAsPublishError,
  withErrorKind,
} from '@api/services/integrations/publishers/publish-error.util';
import { verifyMediaPublish } from '@api/services/integrations/publishers/publisher-media-verification.util';
import { mapMetaFailure } from '@api/services/integrations/publishers/social-publish-error.mappers';
import { CredentialPlatform, PublishErrorKind } from '@genfeedai/contracts';
import {
  readChannelSettingBoolean,
  readChannelSettingNumber,
  readChannelSettingString,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import {
  INSTAGRAM_AI_GENERATED_SETTING_KEY,
  INSTAGRAM_AUDIO_ID_SETTING_KEY,
  INSTAGRAM_AUDIO_VOLUME_SETTING_KEY,
  INSTAGRAM_VIDEO_VOLUME_SETTING_KEY,
  type InstagramAudioConfiguration,
} from '@genfeedai/contracts/api-types/contracts/instagram-publishing.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

const LEADING_AT_SIGN_PATTERN = /^@/;

@Traced()
@Injectable()
export class InstagramPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.INSTAGRAM;
  readonly supportsTextOnly = false;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true; // 2-20 images
  readonly supportsThreads = true; // Supports TEXT children as first comments

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly instagramService: InstagramService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Instagram derives the container type from the media, so the `reel`
   * placement is only reachable with a video. Rejecting the mismatch here keeps
   * the composer's choice honest instead of silently publishing to the feed.
   */
  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    const base = super.validatePost(context, mediaInfo);
    if (!base.valid) {
      return base;
    }

    const carouselError = this.validateCarouselImageCount(mediaInfo);
    if (carouselError) {
      return carouselError;
    }

    const placement = readChannelSettingString(context.settings, 'placement');
    if (placement === 'reel' && mediaInfo.isImagePost) {
      return {
        error: 'Instagram reels require a video; images publish to the feed',
        valid: false,
      };
    }
    if (placement === 'story' && mediaInfo.mediaUrls.length !== 1) {
      return {
        error: 'An Instagram story is one image or one video',
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Whether an earlier, unconfirmed publish landed on the account.
   *
   * Matches the exact caption and media shape (image, reel, carousel size)
   * among the account's media created since the attempt began. The result
   * carries the same media id, shortcode and URL a confirmed publish returns.
   */
  async verifyPublished(
    context: PublishContext,
    attemptStartedAt: Date,
  ): Promise<PublishResult | null> {
    // A story is not in the account's media list, so a feed post of the same
    // shape could be mistaken for it. It cannot be confirmed this way.
    if (readChannelSettingString(context.settings, 'placement') === 'story') {
      return null;
    }
    const mediaInfo = this.extractMediaInfo(context.post);
    const found = await verifyMediaPublish(
      attemptStartedAt,
      (cursor) =>
        this.instagramService.listPublishVerificationPage(
          context.organizationId,
          context.brandId,
          context.credential.id,
          context.credential.externalId,
          attemptStartedAt,
          cursor,
        ),
      {
        mediaCount: mediaInfo.ingredientIds.length,
        mediaKind: this.resolveVerificationMediaKind(mediaInfo),
        text: this.sanitizeDescription(context.post.description),
      },
    );
    if (!found) return null;
    if (!found.shortcode) {
      throw new Error('Provider verification lacks the Instagram shortcode');
    }
    return this.createSuccessResult(
      found.id,
      this.platform,
      this.buildPostUrl(found.id, context.credential, found.shortcode),
      found.shortcode,
    );
  }

  private resolveVerificationMediaKind(
    mediaInfo: MediaInfo,
  ): ProviderMediaVerificationMatch['mediaKind'] {
    if (!mediaInfo.isImagePost) return 'video';
    return mediaInfo.isCarousel ? 'carousel' : 'image';
  }

  /**
   * Publish a post to Instagram
   */
  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential, organizationId, brandId } = context;
    const mediaInfo = this.extractMediaInfo(post);

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
      let externalId: string | null = null;
      let externalShortcode: string | null = null;

      // Sanitize HTML to plain text - Instagram doesn't support HTML markup
      const caption = this.sanitizeDescription(post.description);
      const isAiGenerated =
        readChannelSettingBoolean(
          context.settings,
          INSTAGRAM_AI_GENERATED_SETTING_KEY,
        ) === true;

      if (readChannelSettingString(context.settings, 'placement') === 'story') {
        // Stories carry no caption or alt text, so only the AI label is sent.
        const storyResult = await this.instagramService.uploadStory(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          !mediaInfo.isImagePost,
          credential.id,
          isAiGenerated,
        );
        if (!storyResult.mediaId) {
          return withErrorKind(
            this.createFailedResult(this.platform, 'Failed to get external ID'),
            PublishErrorKind.OUTCOME_UNKNOWN,
          );
        }
        return this.createSuccessResult(
          storyResult.mediaId,
          this.platform,
          this.buildStoryUrl(storyResult.mediaId, credential),
        );
      }

      if (mediaInfo.isCarousel && mediaInfo.isImagePost) {
        // Carousel of images (2-20 images)
        const carouselResult = await this.instagramService.uploadCarousel(
          organizationId,
          brandId,
          mediaInfo.mediaUrls,
          caption,
          undefined, // hashtags
          credential.id,
          isAiGenerated,
          mediaInfo.altTexts ?? [],
        );
        externalId = carouselResult.mediaId;
        externalShortcode = carouselResult.shortcode;
      } else if (mediaInfo.isImagePost) {
        // Single image to feed
        const imageResult = await this.instagramService.uploadImage(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          caption,
          undefined, // hashtags
          credential.id,
          isAiGenerated,
          mediaInfo.altTexts?.[0],
        );
        externalId = imageResult.mediaId;
        externalShortcode = imageResult.shortcode;
      } else {
        // Video as Reel (Instagram requires all videos to use Reels API since July 2022)
        // `placement: 'reel'` means reel-only, so it suppresses the feed copy
        // that the default feed placement keeps.
        const placement = readChannelSettingString(
          context.settings,
          'placement',
        );
        const shareToFeed =
          placement === 'reel' ? false : (post.isShareToFeedSelected ?? true);

        const reelResult = await this.instagramService.uploadReel(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          caption,
          context.coverImageUrl,
          undefined, // hashtags
          shareToFeed,
          credential.id,
          isAiGenerated,
          this.readAudioConfiguration(context),
        );
        externalId = reelResult.mediaId;
        externalShortcode = reelResult.shortcode;
      }

      if (!externalId) {
        return withErrorKind(
          this.createFailedResult(this.platform, 'Failed to get external ID'),
          PublishErrorKind.OUTCOME_UNKNOWN,
        );
      }

      const postUrl = this.buildPostUrl(
        externalId,
        credential,
        externalShortcode,
      );
      return this.createSuccessResult(
        externalId,
        this.platform,
        postUrl,
        externalShortcode,
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throwAsPublishError(error, mapMetaFailure);
    }
  }

  /**
   * A story lives at the account's stories page, not at a `/p/` post URL, and
   * the API returns no shortcode for it. Without the account handle the link
   * falls back to the account's profile.
   */
  private buildStoryUrl(
    mediaId: string,
    credential: CredentialDocument,
  ): string {
    const handle = credential.externalHandle?.replace(
      LEADING_AT_SIGN_PATTERN,
      '',
    );
    if (!handle) {
      return 'https://www.instagram.com/';
    }
    return `https://www.instagram.com/stories/${encodeURIComponent(handle)}/${encodeURIComponent(mediaId)}/`;
  }

  /** The Reel's music from the target settings, or none when no track is set. */
  private readAudioConfiguration(
    context: PublishContext,
  ): InstagramAudioConfiguration | undefined {
    const audioId = readChannelSettingString(
      context.settings,
      INSTAGRAM_AUDIO_ID_SETTING_KEY,
    )?.trim();
    if (!audioId) {
      return undefined;
    }
    const audioVolume = readChannelSettingNumber(
      context.settings,
      INSTAGRAM_AUDIO_VOLUME_SETTING_KEY,
    );
    const videoVolume = readChannelSettingNumber(
      context.settings,
      INSTAGRAM_VIDEO_VOLUME_SETTING_KEY,
    );
    return {
      audio_id: audioId,
      ...(audioVolume !== undefined ? { audio_volume: audioVolume } : {}),
      ...(videoVolume !== undefined ? { video_volume: videoVolume } : {}),
    };
  }

  /**
   * Build Instagram post URL
   */
  buildPostUrl(
    _externalId: string,
    _credential: CredentialDocument,
    externalShortcode?: string,
  ): string {
    // Use shortcode for Instagram URLs
    return `https://www.instagram.com/p/${externalShortcode}`;
  }

  /**
   * Publish TEXT children as comments on the Instagram post
   * For Instagram, "thread children" are posted as comments on the main post
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
        this.instagramService.postComment(
          organizationId,
          brandId,
          parentExternalId,
          text,
          // Comments go out as the account that owns the parent media.
          context.credential.id,
        ),
      updateChild: (childId, update) =>
        this.postsService.patch(childId, update),
    });
  }
}
