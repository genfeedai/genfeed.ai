import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LinkedInPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.LINKEDIN;
  readonly supportsTextOnly = false;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = false;
  readonly supportsThreads = true; // Supports TEXT children as first comments

  private getLinkedInPublishId(result: unknown): string | null {
    if (
      result &&
      typeof result === 'object' &&
      'id' in result &&
      typeof result.id === 'string'
    ) {
      return result.id;
    }

    return null;
  }

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly linkedInService: LinkedInService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to LinkedIn
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

      // Sanitize HTML to plain text - LinkedIn doesn't support HTML markup
      const caption = this.sanitizeDescription(post.description);

      if (mediaInfo.isImagePost) {
        // Upload single image with caption
        const result = await this.linkedInService.uploadImage(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          caption,
        );
        externalId = this.getLinkedInPublishId(result);
      } else {
        // Upload video with caption
        const result = await this.linkedInService.uploadVideo(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          caption,
        );
        externalId = this.getLinkedInPublishId(result);
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
   * Build LinkedIn post URL
   */
  buildPostUrl(
    externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    // LinkedIn post URLs use activity URN format
    return `https://www.linkedin.com/feed/update/${externalId}`;
  }

  /**
   * Publish TEXT children as comments on the LinkedIn post
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

    // Post each TEXT child as a comment
    for (const child of sortedChildren) {
      try {
        // Sanitize HTML to plain text for comments
        const commentText = this.sanitizeDescription(child.description);
        const commentResult = await this.linkedInService.postComment(
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
