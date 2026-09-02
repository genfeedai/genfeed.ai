import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PostValidationResult,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { readChannelSettingString } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MastodonPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.MASTODON;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true; // Mastodon supports up to 4 media attachments
  readonly supportsThreads = true; // Can reply to own status for threads

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly mastodonService: MastodonService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Override validation for Mastodon-specific requirements
   */
  override validatePost(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): PostValidationResult {
    // Run base validation first (includes catalog-driven caption length)
    const baseValidation = super.validatePost(context, mediaInfo);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // Mastodon supports max 4 media attachments
    if (mediaInfo.ingredientIds.length > 4) {
      return {
        error: 'Mastodon supports a maximum of 4 media attachments',
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Publish a status to Mastodon
   */
  async publish(context: PublishContext): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { post, credential } = context;
    const mediaInfo = this.extractMediaInfo(post);

    // Log the attempt
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
      const mastodonCredential = credential;

      // The explicit instance setting wins; the credential's instance is the
      // fallback for releases scheduled before the setting existed.
      const instanceUrl =
        readChannelSettingString(context.settings, 'instanceUrl') ??
        mastodonCredential?.description;

      if (!mastodonCredential?.accessToken || !instanceUrl) {
        this.logger.error(
          `${url} Mastodon credential or instance URL not found`,
          { postId: context.postId },
        );
        return this.createFailedResult(
          this.platform,
          'Mastodon credential or instance URL not found',
        );
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        mastodonCredential.accessToken,
      );

      // Sanitize HTML to plain text - Mastodon supports plain text
      const text = this.sanitizeDescription(post.description);

      // Upload media if present
      let mediaIds: string[] | undefined;
      if (mediaInfo.hasIngredients) {
        mediaIds = [];
        for (const mediaUrl of mediaInfo.mediaUrls) {
          const attachment = await this.mastodonService.uploadMedia(
            instanceUrl,
            decryptedAccessToken,
            mediaUrl,
          );
          mediaIds.push(attachment.id);
        }
      }

      // Publish the status
      const status = await this.mastodonService.publishStatus(
        instanceUrl,
        decryptedAccessToken,
        text,
        mediaIds,
        undefined, // Not a reply
        context.visibility ??
          readChannelSettingString(context.settings, 'visibility') ??
          PostVisibility.PUBLIC,
      );

      if (!status?.id) {
        return this.createFailedResult(
          this.platform,
          'Failed to get external ID',
        );
      }

      const postUrl = this.buildPostUrl(status.id, credential);
      return this.createSuccessResult(status.id, this.platform, postUrl);
    } catch (error: unknown) {
      this.logger.error(`${url} failed to publish`, {
        error: (error as Error)?.message,
        postId: context.postId,
      });
      throw error;
    }
  }

  /**
   * Publish thread children as replies to the parent status
   */
  async publishThreadChildren(
    context: PublishContext,
    children: Array<Record<string, unknown>>,
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Sort children by order to ensure correct thread sequence
    const sortedChildren = [...children].sort(
      (a, b) => ((a.order as number) || 0) - ((b.order as number) || 0),
    );

    this.logger.log(
      `${url} publishing ${sortedChildren.length} thread children`,
      {
        childrenCount: sortedChildren.length,
        parentExternalId,
        parentPostId: context.postId,
      },
    );

    // Replies go out as the same account that posted the parent status.
    const mastodonCredential = context.credential;

    const instanceUrl =
      readChannelSettingString(context.settings, 'instanceUrl') ??
      mastodonCredential?.description;

    if (!mastodonCredential?.accessToken || !instanceUrl) {
      this.logger.error(`${url} Mastodon credential not found for thread`, {
        parentPostId: context.postId,
      });
      return;
    }

    const decryptedAccessToken = EncryptionUtil.decrypt(
      mastodonCredential.accessToken,
    );

    // Replies inherit the parent status's audience.
    const visibility =
      context.visibility ??
      readChannelSettingString(context.settings, 'visibility') ??
      PostVisibility.PUBLIC;

    let replyToId = parentExternalId;

    for (const child of sortedChildren) {
      const childId = this.getRecordId(child);

      try {
        const text = this.sanitizeDescription(child.description as string);

        // Upload media if child has ingredients
        let mediaIds: string[] | undefined;
        const childIngredients =
          (child.ingredients as Array<{ id?: string }>) || [];
        if (childIngredients.length > 0) {
          mediaIds = [];
          const childIngredientIds = childIngredients.map((ingredient) => {
            return ingredient?.id
              ? ingredient.id.toString()
              : ingredient.toString();
          });
          const childCategory = child.category as PostCategory;
          const isImagePost =
            childCategory === PostCategory.IMAGE ||
            (childCategory === PostCategory.TEXT &&
              childIngredientIds.length > 0);

          for (const id of childIngredientIds) {
            const mediaUrl = isImagePost
              ? `${this.configService.ingredientsEndpoint}/images/${id}`
              : `${this.configService.ingredientsEndpoint}/videos/${id}`;

            const attachment = await this.mastodonService.uploadMedia(
              instanceUrl,
              decryptedAccessToken,
              mediaUrl,
            );
            mediaIds.push(attachment.id);
          }
        }

        // Post as reply to previous status in thread
        const status = await this.mastodonService.publishStatus(
          instanceUrl,
          decryptedAccessToken,
          text.substring(0, 500), // Truncate if needed
          mediaIds,
          replyToId,
          visibility,
        );

        if (status?.id) {
          await this.postsService.patch(childId, {
            externalId: status.id,
            publicationDate: new Date(),
            targetExecutionState: TargetExecutionState.PUBLISHED,
          });

          this.logger.log(`${url} published thread child`, {
            childExternalId: status.id,
            childPostId: childId,
            order: child.order,
            replyToId,
          });

          // Next reply will be to this status (creating a chain)
          replyToId = status.id;
        } else {
          this.logger.error(`${url} failed to publish thread child`, {
            childPostId: childId,
            order: child.order,
          });

          await this.postsService.patch(childId, {
            targetExecutionState: TargetExecutionState.FAILED,
          });
        }
      } catch (error: unknown) {
        this.logger.error(`${url} error publishing thread child`, {
          childPostId: childId,
          error: (error as Error)?.message,
          order: child.order,
        });

        await this.postsService.patch(childId, {
          targetExecutionState: TargetExecutionState.FAILED,
        });
      }
    }

    this.logger.log(`${url} completed publishing thread children`, {
      childrenCount: sortedChildren.length,
      parentPostId: context.postId,
    });
  }

  /**
   * Build Mastodon status URL
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    // Instance URL is stored in credential.description
    const instanceUrl = credential.description || '';
    const username = credential.externalHandle || 'user';
    // Remove @ prefix if present for URL construction
    const cleanUsername = username.replace(/^@/, '').split('@')[0];
    return `${instanceUrl}/@${cleanUsername}/${externalId}`;
  }
}
