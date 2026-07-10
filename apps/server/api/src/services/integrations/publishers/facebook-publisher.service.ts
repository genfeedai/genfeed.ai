import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FacebookPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.FACEBOOK;
  readonly supportsTextOnly = false;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = false;
  readonly supportsThreads = true; // Supports TEXT children as first comments

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly facebookService: FacebookService,
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to Facebook
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
      // Get Facebook credential with page access token
      const fbCredential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.FACEBOOK,
      });

      if (!fbCredential?.accessToken || !fbCredential?.externalId) {
        this.logger.error(`${url} Facebook credential or page ID not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Facebook credential or page ID not found',
        );
      }

      // Get page access token from user token
      const pagesResponse = await this.facebookService.getUserPages(
        organizationId,
        brandId,
      );
      const targetPage = pagesResponse.find(
        (page) => page.id === fbCredential.externalId,
      );

      if (!targetPage?.accessToken) {
        this.logger.error(`${url} Facebook page access token not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Facebook page access token not found',
        );
      }

      let externalId: string | null = null;

      // Sanitize HTML to plain text - Facebook doesn't support HTML markup
      const caption = this.sanitizeDescription(post.description);

      if (mediaInfo.isImagePost) {
        // Upload single image with caption
        externalId = await this.facebookService.uploadImage(
          fbCredential.externalId, // pageId
          targetPage.accessToken, // pageAccessToken
          mediaInfo.mediaUrls[0],
          caption,
        );
      } else {
        // Upload video (has built-in page handling)
        externalId = await this.facebookService.uploadVideo(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          post.label ?? '',
          caption,
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
   * Build Facebook post URL
   */
  buildPostUrl(
    externalId: string,
    _credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    return `https://www.facebook.com/${externalId}`;
  }

  /**
   * Publish TEXT children as comments on the Facebook post
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
        this.facebookService.postComment(
          organizationId,
          brandId,
          parentExternalId,
          text,
        ),
      updateChild: (childId, update) =>
        this.postsService.patch(childId, update),
    });
  }
}
