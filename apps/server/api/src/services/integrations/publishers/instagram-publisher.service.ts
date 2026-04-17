import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class InstagramPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.INSTAGRAM;
  readonly supportsTextOnly = false;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true; // 2-10 images
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
   * Publish a post to Instagram
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
      let externalId: string | null = null;
      let externalShortcode: string | null = null;

      // Sanitize HTML to plain text - Instagram doesn't support HTML markup
      const caption = this.sanitizeDescription(post.description);

      if (mediaInfo.isCarousel && mediaInfo.isImagePost) {
        // Carousel of images (2-10 images)
        const carouselResult = await this.instagramService.uploadCarousel(
          organizationId,
          brandId,
          mediaInfo.mediaUrls,
          caption,
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
        );
        externalId = imageResult.mediaId;
        externalShortcode = imageResult.shortcode;
      } else {
        // Video as Reel (Instagram requires all videos to use Reels API since July 2022)
        const reelResult = await this.instagramService.uploadReel(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          caption,
          undefined, // coverImageUrl
          undefined, // hashtags
          post.isShareToFeedSelected ?? true,
        );
        externalId = reelResult.mediaId;
        externalShortcode = reelResult.shortcode;
      }

      if (!externalId) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID',
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
      throw error;
    }
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

    // Post each TEXT child as a comment
    for (const child of sortedChildren) {
      try {
        // Sanitize HTML to plain text for comments
        const commentText = this.sanitizeDescription(child.description);
        const commentResult = await this.instagramService.postComment(
          organizationId,
          brandId,
          parentExternalId,
          commentText,
        );

        if (commentResult?.commentId) {
          // Update child post with externalId and status
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
