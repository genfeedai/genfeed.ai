import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory } from '@genfeedai/enums';
import {
  getIntegrationProviderDefinition,
  type IntegrationProviderCapability,
  providerSupportsCapability,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

const LINKEDIN_PROVIDER = getIntegrationProviderDefinition('linkedin');

function linkedInSupports(capability: IntegrationProviderCapability): boolean {
  return LINKEDIN_PROVIDER
    ? providerSupportsCapability(LINKEDIN_PROVIDER, capability)
    : false;
}

@Injectable()
export class LinkedInPublisherService extends BasePublisherService {
  readonly platform =
    LINKEDIN_PROVIDER?.platform ?? CredentialPlatform.LINKEDIN;
  readonly supportsTextOnly = linkedInSupports('publish_post');
  readonly supportsImages = linkedInSupports('publish_post');
  readonly supportsVideos = linkedInSupports('publish_post');
  readonly supportsCarousel = false;
  readonly supportsThreads = linkedInSupports('publish_post'); // Supports TEXT children as first comments

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

      if (post.category === PostCategory.TEXT && !mediaInfo.hasIngredients) {
        const result = await this.linkedInService.createTextPost(
          organizationId,
          brandId,
          caption,
        );
        externalId = this.getLinkedInPublishId(result);
      } else if (mediaInfo.isImagePost) {
        const result = await this.linkedInService.uploadImage(
          organizationId,
          brandId,
          mediaInfo.mediaUrls[0],
          caption,
        );
        externalId = this.getLinkedInPublishId(result);
      } else {
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
    return `${
      LINKEDIN_PROVIDER?.endpoints.appBaseUrl ?? 'https://www.linkedin.com'
    }/feed/update/${externalId}`;
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
    return this.publishTextChildrenAsComments({
      children,
      context,
      logPrefix: url,
      parentExternalId,
      publishComment: (text) =>
        this.linkedInService.postComment(
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
