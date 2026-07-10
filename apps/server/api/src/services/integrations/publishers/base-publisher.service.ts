import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type {
  IPublisher,
  MediaInfo,
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';

type CommentPublishResult = {
  commentId?: string | null;
};

type ThreadChildStatusUpdate = {
  externalId?: string;
  publicationDate?: Date;
  status: PostStatus;
};

type PublishTextChildrenAsCommentsParams = {
  children: ThreadChild[];
  context: PublishContext;
  logPrefix: string;
  parentExternalId: string;
  publishComment: (
    text: string,
  ) => Promise<CommentPublishResult | null | undefined>;
  updateChild: (
    childId: string,
    update: ThreadChildStatusUpdate,
  ) => Promise<unknown>;
};

/**
 * Base class for platform publishers
 * Provides common functionality for all platform publishers
 */
export abstract class BasePublisherService implements IPublisher {
  protected readonly constructorName: string;

  abstract readonly platform: CredentialPlatform;
  abstract readonly supportsTextOnly: boolean;
  abstract readonly supportsImages: boolean;
  abstract readonly supportsVideos: boolean;
  abstract readonly supportsCarousel: boolean;
  abstract readonly supportsThreads: boolean;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
  ) {
    this.constructorName = this.constructor.name;
  }

  protected getRecordId(value: unknown): string {
    if (
      value !== null &&
      typeof value === 'object' &&
      'id' in value &&
      (value as { id?: unknown }).id
    ) {
      const id = (value as { id?: unknown }).id;

      if (typeof id === 'string') {
        return id;
      }

      if (
        id !== null &&
        typeof id === 'object' &&
        'toString' in id &&
        typeof (id as { toString: () => string }).toString === 'function'
      ) {
        return (id as { toString: () => string }).toString();
      }
    }

    return String(value);
  }

  /**
   * Main publish method - to be implemented by each platform
   */
  abstract publish(context: PublishContext): Promise<PublishResult>;

  /**
   * Build platform-specific post URL
   */
  abstract buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    externalShortcode?: string,
  ): string;

  /**
   * Extract media information from a post
   */
  protected extractMediaInfo(post: PostEntity): MediaInfo {
    const ingredients = post.ingredients || [];
    const hasIngredients = ingredients && ingredients.length > 0;

    // Extract ingredient IDs (handle both ObjectId and populated objects)
    const ingredientIds = ingredients.map((ingredient: unknown) =>
      this.getRecordId(ingredient),
    );

    const isCarousel = ingredientIds.length > 1;

    // Determine if this is an image post
    // TEXT posts with ingredients are treated as IMAGE posts
    const isImagePost =
      post.category === PostCategory.IMAGE ||
      (post.category === PostCategory.TEXT && hasIngredients);

    // Build media URLs
    const mediaUrls = ingredientIds.map((id: string) =>
      isImagePost
        ? `${this.configService.ingredientsEndpoint}/images/${id}`
        : `${this.configService.ingredientsEndpoint}/videos/${id}`,
    );

    return {
      hasIngredients,
      ingredientIds,
      isCarousel,
      isImagePost,
      mediaUrls,
    };
  }

  /**
   * Validate post can be published on this platform
   * Override in subclasses for platform-specific validation
   */
  validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): { valid: boolean; error?: string } {
    const { post } = context;
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Check text-only support
    if (post.category === PostCategory.TEXT && !mediaInfo.hasIngredients) {
      if (!this.supportsTextOnly) {
        this.logger.warn(`${url} text-only posts not supported`, {
          platform: this.platform,
          postId: post.id.toString(),
        });
        return {
          error: `${this.platform} does not support text-only posts`,
          valid: false,
        };
      }
    }

    // Check image support
    if (mediaInfo.isImagePost && !this.supportsImages) {
      return {
        error: `${this.platform} does not support image posts`,
        valid: false,
      };
    }

    // Check video support
    if (
      !mediaInfo.isImagePost &&
      mediaInfo.hasIngredients &&
      !this.supportsVideos
    ) {
      return {
        error: `${this.platform} does not support video posts`,
        valid: false,
      };
    }

    // Check carousel support
    if (mediaInfo.isCarousel && !this.supportsCarousel) {
      return {
        error: `${this.platform} does not support carousel posts`,
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Create a failed result
   */
  protected createFailedResult(
    platform: CredentialPlatform | string,
    error?: string,
  ): PublishResult {
    return {
      error,
      externalId: null,
      platform,
      status: PostStatus.FAILED,
      success: false,
      url: '',
    };
  }

  /**
   * Create a success result
   */
  protected createSuccessResult(
    externalId: string,
    platform: CredentialPlatform | string,
    url: string,
    externalShortcode?: string,
  ): PublishResult {
    return {
      externalId,
      externalShortcode,
      platform,
      status: PostStatus.PUBLIC,
      success: true,
      url,
    };
  }

  /**
   * Log publishing attempt
   */
  protected logPublishAttempt(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): void {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} publishing to ${this.platform}`, {
      category: context.post.category,
      ingredientCount: mediaInfo.ingredientIds.length,
      isCarousel: mediaInfo.isCarousel,
      isImagePost: mediaInfo.isImagePost,
      postId: context.postId,
    });
  }

  /**
   * Sanitize description by converting HTML to plain text
   * Strips HTML tags and converts block elements to newlines
   * Use this for platforms that don't support HTML markup in captions
   */
  protected sanitizeDescription(
    description: string | null | undefined,
  ): string {
    return htmlToText(description);
  }

  protected async publishTextChildrenAsComments({
    children,
    context,
    logPrefix,
    parentExternalId,
    publishComment,
    updateChild,
  }: PublishTextChildrenAsCommentsParams): Promise<void> {
    const textChildren = children.filter(
      (child) => child.category === PostCategory.TEXT,
    );

    if (textChildren.length === 0) {
      this.logger.log(`${logPrefix} no TEXT children to post as comments`, {
        parentExternalId,
        parentPostId: context.postId,
      });
      return;
    }

    const sortedChildren = [...textChildren].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    this.logger.log(`${logPrefix} posting ${sortedChildren.length} comments`, {
      childrenCount: sortedChildren.length,
      parentExternalId,
      parentPostId: context.postId,
    });

    for (const child of sortedChildren) {
      const childId = child.id.toString();

      try {
        const commentResult = await publishComment(
          this.sanitizeDescription(child.description),
        );

        if (commentResult?.commentId) {
          await updateChild(childId, {
            externalId: commentResult.commentId,
            publicationDate: new Date(),
            status: PostStatus.PUBLIC,
          });

          this.logger.log(`${logPrefix} posted comment`, {
            childPostId: childId,
            commentId: commentResult.commentId,
            order: child.order,
          });
        } else {
          this.logger.error(`${logPrefix} failed to post comment`, {
            childPostId: childId,
            order: child.order,
          });

          await updateChild(childId, { status: PostStatus.FAILED });
        }
      } catch (error: unknown) {
        this.logger.error(`${logPrefix} error posting comment`, {
          childPostId: childId,
          error: (error as Error)?.message,
          order: child.order,
        });

        await updateChild(childId, { status: PostStatus.FAILED });
      }
    }

    this.logger.log(`${logPrefix} completed posting comments`, {
      childrenCount: sortedChildren.length,
      parentPostId: context.postId,
    });
  }
}
