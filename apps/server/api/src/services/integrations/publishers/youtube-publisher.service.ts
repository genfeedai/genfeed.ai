import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type ThreadChild = {
  _id: { toString(): string } | string;
  category?: PostCategory;
  description?: string;
  order?: number;
};

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
  ): { valid: boolean; error?: string } {
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

    return { valid: true };
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
      return this.createFailedResult(this.platform, validation.error);
    }

    try {
      const externalId = await this.youtubeService.uploadVideo(
        organizationId,
        brandId,
        mediaInfo.ingredientIds[0],
        post,
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
        const commentResult = await this.youtubeService.postComment(
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
