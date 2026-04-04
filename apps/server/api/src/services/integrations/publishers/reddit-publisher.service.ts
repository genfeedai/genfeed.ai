import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
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
  ): { valid: boolean; error?: string } {
    // Validate subreddit is configured - don't silently post to wrong target
    const subreddit = context.credential.externalId;
    if (!subreddit) {
      return {
        error:
          'Reddit subreddit not configured in credential (externalId required)',
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

    return { valid: true };
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
      return this.createFailedResult(this.platform, validation.error);
    }

    try {
      // Sanitize HTML to plain text - Reddit doesn't support HTML markup
      const description = this.sanitizeDescription(post.description);
      const title = post.label ?? 'Untitled';
      const subreddit = credential.externalId; // Validated in validatePost()

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
        );

        // If there's a description, add it as the first comment
        if (description) {
          try {
            await this.redditService.postComment(
              organizationId,
              brandId,
              externalId,
              description,
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
        );
      }

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
    children: unknown[],
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { organizationId, brandId } = context;

    // Filter for TEXT category children only - these become comments
    const textChildren = children.filter(
      (child) => child.category === PostCategory.TEXT,
    );

    if (textChildren.length === 0) {
      this.logger.log(`${url} no TEXT children to post as comments`, {
        parentExternalId,
        parentPostId: context.postId,
      });
      return;
    }

    // Sort by order to ensure correct sequence
    const sortedChildren = [...textChildren].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    this.logger.log(`${url} posting ${sortedChildren.length} comments`, {
      childrenCount: sortedChildren.length,
      parentExternalId,
      parentPostId: context.postId,
    });

    for (const child of sortedChildren) {
      try {
        const commentText = this.sanitizeDescription(child.description);
        const commentResult = await this.redditService.postComment(
          organizationId,
          brandId,
          parentExternalId,
          commentText,
        );

        if (commentResult?.commentId) {
          await this.postsService.patch(child._id.toString(), {
            externalId: commentResult.commentId,
            publicationDate: new Date(),
            status: PostStatus.PUBLIC,
          });

          this.logger.log(`${url} posted comment`, {
            childPostId: child._id.toString(),
            commentId: commentResult.commentId,
            order: child.order,
          });
        } else {
          this.logger.error(`${url} failed to post comment`, {
            childPostId: child._id.toString(),
            order: child.order,
          });

          await this.postsService.patch(child._id.toString(), {
            status: PostStatus.FAILED,
          });
        }
      } catch (error: unknown) {
        this.logger.error(`${url} error posting comment`, {
          childPostId: child._id.toString(),
          error: (error as Error)?.message,
          order: child.order,
        });

        await this.postsService.patch(child._id.toString(), {
          status: PostStatus.FAILED,
        });
      }
    }

    this.logger.log(`${url} completed posting comments`, {
      childrenCount: sortedChildren.length,
      parentPostId: context.postId,
    });
  }
}
