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
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { readChannelSettingString } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RedditPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.REDDIT;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = false;
  readonly supportsThreads = true; // Supports TEXT children as first comments

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly redditService: RedditService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Override validation for Reddit-specific requirements
   */
  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    // Validate subreddit is configured - don't silently post to wrong target.
    // The explicit setting wins; the credential's subreddit is the fallback for
    // releases scheduled before the setting existed.
    const subreddit =
      readChannelSettingString(context.settings, 'subreddit') ??
      context.credential.externalId;
    if (!subreddit) {
      return {
        error:
          'Reddit subreddit not configured; set the subreddit setting or the credential external ID',
        valid: false,
      };
    }

    // Reddit does not support carousel/multi-image posts
    if (mediaInfo.isCarousel) {
      return {
        error:
          'Reddit does not support carousel posts. Use a single image or video.',
        valid: false,
      };
    }

    // This override skips super.validatePost, so the catalog length
    // backstop must run explicitly.
    return this.validateCaptionLength(context);
  }

  /**
   * Publish a post to Reddit
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
      // Sanitize HTML to plain text - Reddit doesn't support HTML markup
      const description = this.sanitizeDescription(post.description);
      const title = post.label ?? 'Untitled';
      const subreddit =
        readChannelSettingString(context.settings, 'subreddit') ??
        credential.externalId;
      const flairId = readChannelSettingString(context.settings, 'flairId');

      if (!subreddit) {
        return this.createFailedResult(
          this.platform,
          'Reddit subreddit not configured; set the subreddit setting or the credential external ID',
        );
      }

      let externalId: string | undefined;

      if (mediaInfo.hasIngredients) {
        // Image or video post: submit as a link post with the media URL.
        // Reddit auto-embeds images and videos from direct URLs.
        externalId = await this.redditService.submitPost(
          organizationId,
          brandId,
          subreddit,
          title,
          undefined, // No self-text for link posts
          mediaInfo.mediaUrls[0],
          flairId,
          credential.id,
        );

        // If there's a description, add it as the first comment
        if (description) {
          try {
            await this.redditService.postComment(
              organizationId,
              brandId,
              externalId,
              description,
              credential.id,
            );
          } catch (commentError: unknown) {
            // Non-critical: post succeeded, comment failed
            this.logger.warn(`${url} failed to add description comment`, {
              error: (commentError as Error)?.message,
              postId: context.postId,
            });
          }
        }
      } else {
        // Text-only post
        externalId = await this.redditService.submitPost(
          organizationId,
          brandId,
          subreddit,
          title,
          description || undefined,
          undefined, // No link URL for text posts
          flairId,
          credential.id,
        );
      }

      if (!externalId) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID',
        );
      }

      // Built from the resolved subreddit rather than `buildPostUrl`: the
      // interface only receives the credential, so it cannot see a setting that
      // overrode the credential's subreddit.
      const postUrl = `https://www.reddit.com/r/${subreddit}/comments/${externalId}`;
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
   * Build Reddit post URL
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    // Subreddit is validated before publish, so it should always exist
    const subreddit = credential.externalId || 'unknown';
    return `https://www.reddit.com/r/${subreddit}/comments/${externalId}`;
  }

  /**
   * Publish TEXT children as comments on the Reddit post
   */
  async publishThreadChildren(
    context: PublishContext,
    children: ThreadChild[],
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { organizationId, brandId } = context;
    return this.publishTextChildrenAsComments({
      children,
      context,
      logPrefix: url,
      parentExternalId,
      publishComment: (text) =>
        this.redditService.postComment(
          organizationId,
          brandId,
          parentExternalId,
          text,
          // Comments go out as the account that submitted the parent post.
          context.credential.id,
        ),
      updateChild: (childId, update) =>
        this.postsService.patch(childId, update),
    });
  }
}
