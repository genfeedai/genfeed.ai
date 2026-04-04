import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ThreadsPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.THREADS;
  readonly supportsTextOnly = true; // Threads primary use case is text
  readonly supportsImages = true;
  readonly supportsVideos = false; // Threads doesn't support video yet
  readonly supportsCarousel = false; // Threads doesn't support carousel yet
  readonly supportsThreads = true; // Native thread/reply support

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly threadsService: ThreadsService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to Threads
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
      let threadId: string | null = null;

      // Sanitize HTML to plain text - Threads doesn't support HTML markup
      const text = this.sanitizeDescription(post.description);

      // Validate character limit (500 for Threads)
      if (text.length > 500) {
        return this.createFailedResult(
          this.platform,
          'Threads posts are limited to 500 characters',
        );
      }

      if (mediaInfo.hasIngredients && mediaInfo.isImagePost) {
        // Image post
        const result = await this.threadsService.publishImage(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          text,
        );
        threadId = result.threadId;
      } else {
        // Text-only post
        const result = await this.threadsService.publishText(
          organizationId,
          brandId,
          text,
        );
        threadId = result.threadId;
      }

      if (!threadId) {
        return this.createFailedResult(
          this.platform,
          'Failed to get thread ID',
        );
      }

      const postUrl = this.buildPostUrl(threadId, credential);
      return this.createSuccessResult(threadId, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  /**
   * Build Threads post URL
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    // Threads URL format: https://www.threads.net/@username/post/{id}
    const username = credential.externalHandle || 'user';
    return `https://www.threads.net/@${username}/post/${externalId}`;
  }

  /**
   * Override validation for Threads-specific rules
   */
  validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): { valid: boolean; error?: string } {
    // First run base validation
    const baseValidation = super.validatePost(context, mediaInfo);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // Threads-specific: no carousel support
    if (mediaInfo.isCarousel) {
      return {
        error: 'Threads does not support carousel posts',
        valid: false,
      };
    }

    // Threads-specific: no video support (yet)
    if (!mediaInfo.isImagePost && mediaInfo.hasIngredients) {
      return {
        error: 'Threads does not support video posts yet',
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Publish TEXT children as replies to the parent thread
   * Threads has native reply support at the API level
   */
  async publishThreadChildren(
    context: PublishContext,
    children: unknown[],
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { organizationId, brandId } = context;

    // Filter for TEXT category children only
    const textChildren = children.filter(
      (child) => child.category === PostCategory.TEXT,
    );

    if (textChildren.length === 0) {
      this.logger.log(`${url} no TEXT children to post as replies`, {
        parentExternalId,
        parentPostId: context.postId,
      });
      return;
    }

    // Sort by order to ensure correct sequence
    const sortedChildren = [...textChildren].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    this.logger.log(`${url} posting ${sortedChildren.length} replies`, {
      childrenCount: sortedChildren.length,
      parentExternalId,
      parentPostId: context.postId,
    });

    // Post each TEXT child as a reply to the parent thread
    let replyToId = parentExternalId;

    for (const child of sortedChildren) {
      try {
        // Sanitize HTML to plain text
        const text = this.sanitizeDescription(child.description);

        // Validate character limit
        if (text.length > 500) {
          this.logger.warn(`${url} child text exceeds 500 chars, truncating`, {
            childPostId: child._id.toString(),
          });
        }

        const result = await this.threadsService.publishText(
          organizationId,
          brandId,
          text.substring(0, 500), // Truncate if needed
          replyToId, // Reply to previous post in thread
        );

        if (result?.threadId) {
          // Update child post with externalId and status
          await this.postsService.patch(child._id.toString(), {
            externalId: result.threadId,
            publicationDate: new Date(),
            status: PostStatus.PUBLIC,
          });

          // Next reply will be to this thread (creating a chain)
          replyToId = result.threadId;

          this.logger.log(`${url} posted reply`, {
            childPostId: child._id.toString(),
            order: child.order,
            threadId: result.threadId,
          });
        } else {
          this.logger.error(`${url} failed to post reply`, {
            childPostId: child._id.toString(),
            order: child.order,
          });

          await this.postsService.patch(child._id.toString(), {
            status: PostStatus.FAILED,
          });
        }
      } catch (error: unknown) {
        this.logger.error(`${url} error posting reply`, {
          childPostId: child._id.toString(),
          error: (error as Error)?.message,
          order: child.order,
        });

        await this.postsService.patch(child._id.toString(), {
          status: PostStatus.FAILED,
        });
      }
    }

    this.logger.log(`${url} completed posting replies`, {
      childrenCount: sortedChildren.length,
      parentPostId: context.postId,
    });
  }
}
