import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import type {
  IPublisher,
  MediaInfo,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';

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
    const ingredientIds = ingredients.map((ingredient: unknown) => {
      return ingredient?._id
        ? ingredient._id.toString()
        : ingredient.toString();
    });

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
          postId: post._id.toString(),
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
}
