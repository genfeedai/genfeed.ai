import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  resolveTwitterReplySettings,
  TwitterService,
} from '@api/services/integrations/twitter/services/twitter.service';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  requireRelationId,
  resolveEntityId,
} from '@api/shared/utils/relation-id/relation-id.util';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

type TwitterClient = {
  v2: {
    tweet: (
      text: string,
      options?: Record<string, unknown>,
    ) => Promise<{ data?: { id?: string } }>;
    uploadMedia: (
      media: Buffer,
      options: { media_type: string },
    ) => Promise<string>;
  };
};

type TwitterQuoteOptions = {
  quote_tweet_id?: string;
  reply_settings?: string;
};

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === 'string') {
    return Buffer.from(data);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(data));
  }

  throw new Error('Unsupported media response type');
}

function requireThreadChildId(child: ThreadChild): string | undefined {
  return typeof child.id === 'string' && child.id.length > 0
    ? child.id
    : undefined;
}

function requireIngredientId(
  ingredient: NonNullable<ThreadChild['ingredients']>[number],
): string | undefined {
  if (typeof ingredient === 'string' && ingredient.length > 0) {
    return ingredient;
  }

  if (ingredient && typeof ingredient === 'object') {
    return resolveEntityId(ingredient.id);
  }

  return undefined;
}

@Injectable()
export class TwitterPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.TWITTER;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true; // Up to 4 images
  readonly supportsThreads = true;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly twitterService: TwitterService,
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
  ) {
    super(configService, logger);
  }

  /**
   * Publish a post to Twitter
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
      let externalId: string | null = null;

      // Handle TEXT-only posts
      if (post.category === PostCategory.TEXT && !mediaInfo.hasIngredients) {
        externalId = await this.publishTextOnly(context);
      } else {
        // Handle media posts (image/video)
        externalId = await this.publishWithMedia(context, mediaInfo);
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
   * Publish a text-only tweet
   */
  private async publishTextOnly(
    context: PublishContext,
  ): Promise<string | null> {
    const { post } = context;
    const userClient = await this.getTwitterClient(context);

    // Convert HTML description to plain text
    const plainTextDescription = htmlToText(post.description);

    // Build tweet options (quote tweet support)
    const tweetOptions: TwitterQuoteOptions = {};
    if (post.quoteTweetId) {
      tweetOptions.quote_tweet_id = post.quoteTweetId;
    }

    const replySettings = resolveTwitterReplySettings(context.settings);
    if (replySettings) {
      tweetOptions.reply_settings = replySettings;
    }

    const tweetRes =
      Object.keys(tweetOptions).length > 0
        ? await userClient.v2.tweet(plainTextDescription, tweetOptions)
        : await userClient.v2.tweet(plainTextDescription);

    return tweetRes?.data?.id || null;
  }

  /**
   * Publish a tweet with media (images or video)
   */
  private async publishWithMedia(
    context: PublishContext,
    mediaInfo: MediaInfo,
  ): Promise<string | null> {
    const { organizationId, brandId, post } = context;

    // Use TwitterService.uploadMedia which handles multi-image
    const externalId = await this.twitterService.uploadMedia(
      organizationId,
      brandId,
      mediaInfo.isCarousel ? mediaInfo.mediaUrls : [mediaInfo.mediaUrls[0]],
      post.description, // Will be converted to plain text in uploadMedia
      mediaInfo.isImagePost ? 'image/jpeg' : 'video/mp4',
      post.quoteTweetId, // Quote tweet support
      context.settings,
      // Publish as the account this post was dispatched for, not whichever
      // account the brand happens to list first.
      context.credential.id,
    );

    return externalId;
  }

  /**
   * Publish thread children as replies
   */
  async publishThreadChildren(
    context: PublishContext,
    children: ThreadChild[],
    parentExternalId: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { credential } = context;

    // Sort children by order to ensure correct thread sequence
    const sortedChildren = [...children].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    );

    this.logger.log(
      `${url} publishing ${sortedChildren.length} thread children`,
      {
        childrenCount: sortedChildren.length,
        parentExternalId,
        parentPostId: context.postId,
      },
    );

    let replyToId = parentExternalId; // First child replies to parent

    // Publish each child as a reply
    for (const child of sortedChildren) {
      const childId = requireThreadChildId(child);
      if (!childId) {
        this.logger.error(`${url} skipped thread child without a scalar id`, {
          order: child.order,
        });
        continue;
      }

      try {
        const childExternalId = await this.publishChildTweet(
          child,
          replyToId,
          credential,
        );

        if (childExternalId) {
          // Update child post with externalId and status
          await this.postsService.patch(childId, {
            externalId: childExternalId,
            publicationDate: new Date(),
            targetExecutionState: TargetExecutionState.PUBLISHED,
          });

          this.logger.log(`${url} published thread child`, {
            childExternalId,
            childPostId: childId,
            order: child.order,
            replyToId,
          });

          // Set this child's ID as the reply target for the next child
          replyToId = childExternalId;
        } else {
          this.logger.error(`${url} failed to publish thread child`, {
            childPostId: childId,
            order: child.order,
          });

          // Mark child as failed but continue with other children
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

        // Mark child as failed but continue with other children
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
   * Publish a single child tweet as a reply
   */
  private async publishChildTweet(
    child: ThreadChild,
    replyToId: string,
    credential: CredentialDocument,
  ): Promise<string | null> {
    const childIngredientIds = (child.ingredients || [])
      .map((ingredient) => requireIngredientId(ingredient))
      .filter((id): id is string => Boolean(id));

    // TEXT posts with ingredients are treated as IMAGE posts
    const childIsImagePost =
      child.category === PostCategory.IMAGE ||
      (child.category === PostCategory.TEXT && childIngredientIds.length > 0);

    // Prepare media URLs for child
    const childMediaUrls = childIngredientIds.map((id: string) =>
      childIsImagePost
        ? `${this.configService.ingredientsEndpoint}/images/${id}`
        : `${this.configService.ingredientsEndpoint}/videos/${id}`,
    );

    // Convert HTML description to plain text
    const plainTextDescription = htmlToText(child.description);

    // Get Twitter client for posting reply
    const userClient = await this.getTwitterClientFromCredential(credential);

    if (childIngredientIds.length > 0) {
      // Child has media - upload media and post as reply
      const mediaIds: string[] = [];
      for (const mediaUrl of childMediaUrls) {
        const mediaRes = await firstValueFrom(
          this.httpService.get(mediaUrl, {
            responseType: 'arraybuffer',
          }),
        );

        const mediaId = await userClient.v2.uploadMedia(
          toBuffer(mediaRes.data),
          {
            media_type: childIsImagePost ? 'image/jpeg' : 'video/mp4',
          },
        );

        mediaIds.push(mediaId);
      }

      // Post reply tweet with media
      const tweetRes = await userClient.v2.tweet(plainTextDescription, {
        media: {
          media_ids: mediaIds as
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string],
        },
        reply: { in_reply_to_tweet_id: replyToId },
      });

      return tweetRes?.data?.id || null;
    } else {
      // Child is text-only - post as reply without media
      const tweetRes = await userClient.v2.tweet(plainTextDescription, {
        reply: { in_reply_to_tweet_id: replyToId },
      });

      return tweetRes?.data?.id || null;
    }
  }

  /**
   * Build Twitter post URL
   */
  buildPostUrl(
    externalId: string,
    credential: CredentialDocument,
    _externalShortcode?: string,
  ): string {
    if (!credential.externalHandle) {
      return this.twitterService.buildTweetUrl(externalId, 'i');
    }

    return this.twitterService.buildTweetUrl(
      externalId,
      credential.externalHandle,
    );
  }

  /**
   * Get Twitter API client for a context
   */
  private async getTwitterClient(
    context: PublishContext,
  ): Promise<TwitterClient> {
    const credentialId = requireRelationId(
      context.credential.id,
      'id',
      'Twitter credential',
    );
    const organizationId = requireRelationId(
      context.organizationId,
      'organization',
      'Twitter publish',
    );
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId,
    });

    if (!credential?.accessToken) {
      throw new Error('Twitter credential not found or invalid');
    }

    return this.getTwitterClientFromCredential(credential);
  }

  /**
   * Get Twitter API client from credential (OAuth 2.0 bearer token)
   */
  private async getTwitterClientFromCredential(
    credential: CredentialDocument,
  ): Promise<TwitterClient> {
    if (!credential.accessToken) {
      throw new Error('Twitter credential is missing an access token');
    }

    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    const { TwitterApi } = await import('twitter-api-v2');
    return new TwitterApi(decryptedAccessToken) as unknown as TwitterClient;
  }
}
