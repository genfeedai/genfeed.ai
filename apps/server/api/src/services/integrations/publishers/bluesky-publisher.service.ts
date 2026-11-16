import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type {
  BlueskyEmbed,
  BlueskyPostRecord,
  BlueskyStrongRef,
} from '@api/services/integrations/bluesky/services/bluesky.service';
import {
  BLUESKY_MAX_VIDEO_BYTES,
  BlueskyService,
} from '@api/services/integrations/bluesky/services/bluesky.service';
import {
  BlueskyCredentialRejectedError,
  BlueskyMediaError,
} from '@api/services/integrations/bluesky/utils/bluesky-api-error.util';
import { prepareBlueskyImage } from '@api/services/integrations/bluesky/utils/bluesky-image.util';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { verifyProviderPublish } from '@api/services/integrations/publishers/publisher-verification.util';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { measurePlatformText } from '@genfeedai/helpers/content/platform-text-length.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

const MAX_IMAGES = 4;
const MAX_TEXT_GRAPHEMES = 300;
const AT_URI_POST_PATTERN = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/;
const MP4_TYPE = 'video/mp4';

interface BlueskyMediaItem {
  isVideo: boolean;
  url: string;
}

@Traced()
@Injectable()
export class BlueskyPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.BLUESKY;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true; // up to 4 images
  readonly supportsThreads = true; // replies to the previous post

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly blueskyService: BlueskyService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    // Base validation includes the catalog caption limit (300 graphemes).
    const baseValidation = super.validatePost(context, mediaInfo);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    if (mediaInfo.isImagePost && mediaInfo.ingredientIds.length > MAX_IMAGES) {
      return {
        error: `Bluesky supports a maximum of ${MAX_IMAGES} images per post`,
        errorCode: 'too_many_media_items',
        valid: false,
      };
    }
    if (
      !mediaInfo.isImagePost &&
      mediaInfo.hasIngredients &&
      mediaInfo.ingredientIds.length > 1
    ) {
      return {
        error: 'Bluesky supports a single video per post',
        errorCode: 'too_many_media_items',
        valid: false,
      };
    }
    if (
      !this.sanitizeDescription(context.post.description).trim() &&
      !mediaInfo.hasIngredients
    ) {
      return {
        error: 'A Bluesky post needs text or media',
        errorCode: 'empty_post',
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Whether an earlier, unconfirmed publish landed: scans the account's recent
   * posts for the exact text. A post with media, a link or a thread cannot be
   * proven by text alone, so it stays uncertain (the helper throws).
   */
  async verifyPublished(
    context: PublishContext,
    attemptStartedAt: Date,
  ): Promise<PublishResult | null> {
    const found = await verifyProviderPublish(
      context,
      attemptStartedAt,
      (cursor) =>
        this.blueskyService.listPublishVerificationPage(
          context,
          attemptStartedAt,
          cursor,
        ),
      { text: this.sanitizeDescription(context.post.description) },
    );
    return found
      ? this.createSuccessResult(
          found.id,
          this.platform,
          found.url || this.buildPostUrl(found.id, context.credential),
        )
      : null;
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
      const text = this.sanitizeDescription(post.description);
      const embed = await this.buildEmbed(
        credential,
        mediaInfo.mediaUrls.map((mediaUrl) => ({
          isVideo: !mediaInfo.isImagePost,
          url: mediaUrl,
        })),
      );
      const facets = await this.blueskyService.buildFacets(credential, text);

      const ref = await this.blueskyService.createPost(credential, {
        $type: 'app.bsky.feed.post',
        createdAt: new Date().toISOString(),
        ...(embed ? { embed } : {}),
        ...(facets.length > 0 ? { facets } : {}),
        text,
      });

      return this.createSuccessResult(
        ref.uri,
        this.platform,
        this.buildPostUrl(ref.uri, credential),
      );
    } catch (error: unknown) {
      if (error instanceof BlueskyCredentialRejectedError) {
        this.logger.warn(`${url} credential rejected`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Bluesky rejected the connected account. Reconnect Bluesky to publish.',
          error.code,
        );
      }
      if (error instanceof BlueskyMediaError) {
        this.logger.warn(`${url} media rejected`, {
          error: error.message,
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          error.message,
          error.code,
        );
      }
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  /** Upload the post's media and wrap the blobs in the embed record. */
  private async buildEmbed(
    credential: CredentialDocument,
    items: BlueskyMediaItem[],
  ): Promise<BlueskyEmbed | undefined> {
    if (items.length === 0) {
      return undefined;
    }

    if (items[0].isVideo) {
      const download = await this.downloadOrReject(
        items[0].url,
        BLUESKY_MAX_VIDEO_BYTES,
      );
      const contentType = download.contentType.split(';')[0].trim();
      if (contentType.toLowerCase() !== MP4_TYPE) {
        throw new BlueskyMediaError(
          'Bluesky only accepts videos in MP4 format',
        );
      }
      const video = await this.blueskyService.uploadBlob(
        credential,
        download.buffer,
        MP4_TYPE,
      );
      return { $type: 'app.bsky.embed.video', video };
    }

    const images: Extract<
      BlueskyEmbed,
      { $type: 'app.bsky.embed.images' }
    >['images'] = [];
    for (const item of items) {
      const download = await this.downloadOrReject(
        item.url,
        this.blueskyService.maxImageDownloadBytes,
      );
      let prepared: Awaited<ReturnType<typeof prepareBlueskyImage>>;
      try {
        prepared = await prepareBlueskyImage(
          download.buffer,
          download.contentType,
        );
      } catch (error: unknown) {
        throw new BlueskyMediaError(
          `Bluesky could not use this image: ${(error as Error).message}`,
        );
      }
      const image = await this.blueskyService.uploadBlob(
        credential,
        prepared.buffer,
        prepared.mimeType,
      );
      images.push({
        alt: '',
        aspectRatio: { height: prepared.height, width: prepared.width },
        image,
      });
    }
    return { $type: 'app.bsky.embed.images', images };
  }

  private async downloadOrReject(mediaUrl: string, maxBytes: number) {
    try {
      return await this.blueskyService.downloadMedia(mediaUrl, maxBytes);
    } catch (error: unknown) {
      throw new BlueskyMediaError((error as Error).message);
    }
  }

  /** Publish thread children as replies, each to the previous post. */
  async publishThreadChildren(
    context: PublishContext,
    children: ThreadChild[],
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { credential } = context;
    const sortedChildren = [...children].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    this.logger.log(
      `${url} publishing ${sortedChildren.length} thread children`,
      { parentExternalId, parentPostId: context.postId },
    );

    let root: BlueskyStrongRef;
    try {
      root = await this.blueskyService.getPostRef(credential, parentExternalId);
    } catch (error: unknown) {
      this.logger.error(`${url} thread parent not found`, {
        error: (error as Error)?.message,
        parentPostId: context.postId,
      });
      return;
    }
    let parent = root;

    for (const child of sortedChildren) {
      const childId = this.getRecordId(child);
      try {
        const text = this.sanitizeDescription(child.description);
        const isVideo =
          child.category === PostCategory.VIDEO ||
          child.category === PostCategory.REEL;
        const mediaUrls = (child.ingredients || []).map((ingredient) =>
          this.requireAuthorizedMediaUrl(ingredient, isVideo),
        );

        if (measurePlatformText(text, this.platform) > MAX_TEXT_GRAPHEMES) {
          throw new BlueskyMediaError(
            `Reply is longer than ${MAX_TEXT_GRAPHEMES} characters`,
          );
        }
        if (!text.trim() && mediaUrls.length === 0) {
          throw new BlueskyMediaError('Reply has no text and no media');
        }

        const embed = await this.buildEmbed(
          credential,
          mediaUrls.slice(0, isVideo ? 1 : MAX_IMAGES).map((mediaUrl) => ({
            isVideo,
            url: mediaUrl,
          })),
        );
        const facets = await this.blueskyService.buildFacets(credential, text);
        const record: BlueskyPostRecord = {
          $type: 'app.bsky.feed.post',
          createdAt: new Date().toISOString(),
          ...(embed ? { embed } : {}),
          ...(facets.length > 0 ? { facets } : {}),
          reply: { parent, root },
          text,
        };
        const ref = await this.blueskyService.createPost(credential, record);

        await this.postsService.patch(childId, {
          externalId: ref.uri,
          publicationDate: new Date(),
          targetExecutionState: TargetExecutionState.PUBLISHED,
        });
        parent = ref;
      } catch (error: unknown) {
        this.logger.error(`${url} error publishing thread child`, {
          childPostId: childId,
          error: (error as Error)?.message,
          order: child.order,
        });
        await this.postsService.patch(childId, {
          targetExecutionState: TargetExecutionState.FAILED,
        });
      }
    }
  }

  /** The bsky.app link of a post: its AT-URI names the account and the key. */
  buildPostUrl(
    externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    const match = AT_URI_POST_PATTERN.exec(externalId);
    if (!match) {
      return '';
    }
    return `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
  }
}
