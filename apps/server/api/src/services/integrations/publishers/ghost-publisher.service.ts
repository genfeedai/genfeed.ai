import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { toArticlePublishError } from '@api/services/integrations/publishers/article-publish-error.util';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { verifyHtmlPublish } from '@api/services/integrations/publishers/publisher-verification.util';
import { WebhookUrlUnresolvableException } from '@api/shared/utils/webhook-validator/webhook-validator.util';
import { CredentialPlatform, PublishErrorKind } from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException, Injectable } from '@nestjs/common';

@Traced()
@Injectable()
export class GhostPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.GHOST;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = false;
  readonly supportsCarousel = false;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly ghostService: GhostService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to Ghost as a blog post.
   * Uses post.description as HTML content and post.label as title.
   * If media is present, the first image is used as the featured image.
   */
  async verifyPublished(
    context: PublishContext,
    attemptStartedAt: Date,
  ): Promise<PublishResult | null> {
    const status = context.isDraft ? 'draft' : 'published';
    const found = await verifyHtmlPublish(
      context,
      attemptStartedAt,
      (cursor) =>
        this.ghostService.listPublishVerificationPage(
          context,
          attemptStartedAt,
          cursor,
        ),
      status,
    );
    if (!found) return null;
    const result = this.createSuccessResult(
      found.id,
      this.platform,
      found.url || this.buildPostUrl(found.id, context.credential),
    );
    return context.isDraft === true
      ? { ...result, isProviderDraft: true }
      : result;
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential } = context;
    const mediaInfo = this.extractMediaInfo(post);

    this.logPublishAttempt(context, mediaInfo);

    // Validate
    const validation = this.validatePost(context, mediaInfo);
    if (!validation.valid) {
      return this.createFailedResult(
        this.platform,
        validation.error,
        validation.errorCode,
      );
    }

    try {
      // The account this post was scheduled for, already resolved by the
      // publish pipeline. Re-resolving it from brand + platform would hand the
      // post to a sibling account the moment the brand connects a second one.
      const ghostCredential = credential;

      // The site URL is `externalId` (see GhostController.connect) — Ghost
      // has no public handle concept, so `externalHandle` is never populated
      // for it and must not be read as the site URL.
      if (!ghostCredential?.accessToken || !ghostCredential?.externalId) {
        this.logger.error(`${url} Ghost credential or site URL not found`, {
          postId: context.postId,
        });
        return this.createFailedResult(
          this.platform,
          'Ghost credential or site URL not found',
          undefined,
          PublishErrorKind.CHANNEL_DISCONNECTED,
        );
      }

      const decryptedApiKey = EncryptionUtil.decrypt(
        ghostCredential.accessToken,
      );
      const ghostUrl = ghostCredential.externalId;

      // Ghost supports HTML content natively
      const htmlContent = post.description || '<p></p>';
      const title = post.label ?? 'Untitled';
      const status = context.isDraft ? 'draft' : 'published';

      // Use first image as featured image if media is present
      const featureImage =
        mediaInfo.hasIngredients && mediaInfo.isImagePost
          ? mediaInfo.mediaUrls[0]
          : undefined;

      const ghostPost = await this.ghostService.createPost(
        ghostUrl,
        decryptedApiKey,
        title,
        htmlContent,
        status,
        featureImage,
      );

      if (!ghostPost?.id) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID from Ghost',
          undefined,
          PublishErrorKind.OUTCOME_UNKNOWN,
        );
      }

      // Ghost returns the post URL directly
      const postUrl =
        ghostPost.url || this.buildPostUrl(ghostPost.id, credential);
      return this.createSuccessResult(ghostPost.id, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw this.toGhostPublishError(error);
    }
  }

  /**
   * The destination guard runs before the request is sent, so its refusal
   * proves nothing was published: an address that does not resolve may be a
   * passing DNS failure, any other refusal means the stored site URL is not
   * usable and the owner has to reconnect.
   */
  private toGhostPublishError(error: unknown): PublishError {
    if (error instanceof WebhookUrlUnresolvableException) {
      return new PublishError(
        PublishErrorKind.RETRY_LATER,
        'The Ghost site address could not be resolved',
        { cause: error },
      );
    }
    if (error instanceof BadRequestException) {
      return new PublishError(
        PublishErrorKind.CHANNEL_DISCONNECTED,
        'The Ghost site address is not a usable public HTTPS address',
        { cause: error },
      );
    }
    return toArticlePublishError(error);
  }

  /**
   * Build Ghost post URL as fallback when API does not return one.
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    // The site URL is `externalId` (the Ghost account's identity — see
    // GhostController.connect), not `externalHandle`: Ghost has no public
    // handle concept, and `externalHandle` is never populated for it.
    const ghostUrl = credential.externalId || '';
    return `${ghostUrl}/p/${externalId}`;
  }
}
