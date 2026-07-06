import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  type ThreadsCarouselMediaItem,
  ThreadsMediaType,
  ThreadsService,
} from '@api/services/integrations/threads/services/threads.service';
import {
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ThreadsPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.THREADS;
  readonly supportsTextOnly = true; // Threads primary use case is text
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true; // Up to 20 image/video items
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

      const mediaItems = this.extractThreadsMediaItems(
        post.category,
        post.ingredients,
      );

      if (mediaItems.length > 1) {
        // Carousel post
        const result = await this.threadsService.publishCarousel(
          organizationId,
          brandId,
          mediaItems,
          text,
        );
        threadId = result.threadId;
      } else if (mediaItems[0]?.mediaType === ThreadsMediaType.IMAGE) {
        // Image post
        const result = await this.threadsService.publishImage(
          organizationId,
          brandId,
          mediaItems[0].url,
          text,
        );
        threadId = result.threadId;
      } else if (mediaItems[0]?.mediaType === ThreadsMediaType.VIDEO) {
        // Video post
        const result = await this.threadsService.publishVideo(
          organizationId,
          brandId,
          mediaItems[0].url,
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

    if (mediaInfo.ingredientIds.length > 20) {
      return {
        error: 'Threads carousels support at most 20 media items',
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Publish children as replies to the parent thread
   * Threads has native reply support at the API level
   */
  async publishThreadChildren(
    context: PublishContext,
    children: ThreadChild[],
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { organizationId, brandId } = context;

    if (children.length === 0) {
      this.logger.log(`${url} no children to post as replies`, {
        parentExternalId,
        parentPostId: context.postId,
      });
      return;
    }

    // Sort by order to ensure correct sequence
    const sortedChildren = [...children].sort(
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
            childPostId: child.id.toString(),
          });
        }

        const result = await this.publishChildThread(
          child,
          organizationId,
          brandId,
          text.substring(0, 500),
          replyToId,
        );

        if (result?.threadId) {
          // Update child post with externalId and status
          await this.postsService.patch(child.id.toString(), {
            externalId: result.threadId,
            publicationDate: new Date(),
            status: PostStatus.PUBLIC,
          });

          // Next reply will be to this thread (creating a chain)
          replyToId = result.threadId;

          this.logger.log(`${url} posted reply`, {
            childPostId: child.id.toString(),
            order: child.order,
            threadId: result.threadId,
          });
        } else {
          this.logger.error(`${url} failed to post reply`, {
            childPostId: child.id.toString(),
            order: child.order,
          });

          await this.postsService.patch(child.id.toString(), {
            status: PostStatus.FAILED,
          });
        }
      } catch (error: unknown) {
        this.logger.error(`${url} error posting reply`, {
          childPostId: child.id.toString(),
          error: (error as Error)?.message,
          order: child.order,
        });

        await this.postsService.patch(child.id.toString(), {
          status: PostStatus.FAILED,
        });
      }
    }

    this.logger.log(`${url} completed posting replies`, {
      childrenCount: sortedChildren.length,
      parentPostId: context.postId,
    });
  }

  private extractThreadsMediaItems(
    fallbackCategory: PostCategory | string | undefined,
    ingredients: unknown[] | undefined,
  ): ThreadsCarouselMediaItem[] {
    return (ingredients || []).map((ingredient) => {
      const id = this.getRecordId(ingredient);
      const mediaType = this.getThreadsMediaType(fallbackCategory, ingredient);
      const path = mediaType === ThreadsMediaType.IMAGE ? 'images' : 'videos';

      return {
        mediaType,
        url: `${this.configService.ingredientsEndpoint}/${path}/${id}`,
      };
    });
  }

  private getThreadsMediaType(
    fallbackCategory: PostCategory | string | undefined,
    ingredient: unknown,
  ): ThreadsMediaType.IMAGE | ThreadsMediaType.VIDEO {
    const ingredientCategory =
      ingredient !== null &&
      typeof ingredient === 'object' &&
      'category' in ingredient
        ? String((ingredient as { category?: unknown }).category ?? '')
        : '';
    const category = (ingredientCategory || String(fallbackCategory ?? ''))
      .toLowerCase()
      .trim();

    if (
      category === IngredientCategory.VIDEO.toLowerCase() ||
      category === PostCategory.VIDEO.toLowerCase()
    ) {
      return ThreadsMediaType.VIDEO;
    }

    return ThreadsMediaType.IMAGE;
  }

  private async publishChildThread(
    child: ThreadChild,
    organizationId: string,
    brandId: string,
    text: string,
    replyToId: string,
  ): Promise<{ threadId: string }> {
    const mediaItems = this.extractThreadsMediaItems(
      child.category,
      child.ingredients,
    );

    if (mediaItems.length > 1) {
      return this.threadsService.publishCarousel(
        organizationId,
        brandId,
        mediaItems,
        text,
        replyToId,
      );
    }

    if (mediaItems[0]?.mediaType === ThreadsMediaType.IMAGE) {
      return this.threadsService.publishImage(
        organizationId,
        brandId,
        mediaItems[0].url,
        text,
        replyToId,
      );
    }

    if (mediaItems[0]?.mediaType === ThreadsMediaType.VIDEO) {
      return this.threadsService.publishVideo(
        organizationId,
        brandId,
        mediaItems[0].url,
        text,
        replyToId,
      );
    }

    return this.threadsService.publishText(
      organizationId,
      brandId,
      text,
      replyToId,
    );
  }
}
