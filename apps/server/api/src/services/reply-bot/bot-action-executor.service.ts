import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import {
  normalizeReplyBotPlatform,
  unsupportedReplyBotPlatformMessage,
} from '@api/services/reply-bot/reply-bot-platform.util';
import { ReplyBotPlatform } from '@genfeedai/enums';
import type {
  IReplyBotContentData,
  IReplyBotCredentialData,
  IReplyBotDmResult,
  IReplyBotReplyResult,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TwitterApi } from 'twitter-api-v2';

@Injectable()
export class BotActionExecutorService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly instagramService: InstagramService,
    @Optional() private readonly youtubeService: YoutubeService | undefined,
    @Optional() private readonly twitterService: TwitterService | undefined,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /**
   * Create a Twitter client with user credentials.
   * Tokens are expected to be plaintext — callers must decrypt before building
   * IReplyBotCredentialData (decrypt at the credential-loading boundary).
   *
   * OAuth 2.0 user tokens (brand X connect) are bearer-only. Never treat
   * refreshToken as an OAuth 1.0a access secret — that 401s Send/auto-reply.
   */
  private createTwitterClient(credential: IReplyBotCredentialData): TwitterApi {
    if (!credential.accessToken) {
      throw new Error('Twitter credential is missing accessToken');
    }

    if (credential.accessTokenSecret) {
      return new TwitterApi({
        accessSecret: credential.accessTokenSecret,
        accessToken: credential.accessToken,
        appKey: this.configService.get('TWITTER_CONSUMER_KEY'),
        appSecret: this.configService.get('TWITTER_CONSUMER_SECRET'),
      } as unknown as ConstructorParameters<typeof TwitterApi>[0]);
    }

    return new TwitterApi(credential.accessToken);
  }

  private resolveTwitterService(): TwitterService | undefined {
    if (this.twitterService) {
      return this.twitterService;
    }
    try {
      return this.moduleRef?.get(TwitterService, { strict: false });
    } catch {
      return undefined;
    }
  }

  /**
   * Publish a tweet or reply. Brand OAuth2 (no access secret) goes through
   * TwitterService.postTweet so the token is refreshed the same way as Publish.
   * Quote tweets stay on the user client — postTweet has no quote_tweet_id.
   */
  private async publishTwitterStatus(
    credential: IReplyBotCredentialData,
    text: string,
    options?: { inReplyToTweetId?: string; quoteTweetId?: string },
  ): Promise<string> {
    const organizationId = credential.organizationId;
    const brandId = credential.brandId;
    const twitterService = this.resolveTwitterService();
    const canUsePublisher =
      !credential.accessTokenSecret &&
      Boolean(organizationId) &&
      Boolean(brandId) &&
      Boolean(twitterService) &&
      !options?.quoteTweetId;

    if (canUsePublisher && twitterService && organizationId && brandId) {
      return twitterService.postTweet(
        organizationId,
        brandId,
        text,
        options?.inReplyToTweetId,
        {},
        credential.id,
      );
    }

    const client = this.createTwitterClient(credential);
    if (options?.inReplyToTweetId) {
      const result = await client.v2.tweet(text, {
        reply: { in_reply_to_tweet_id: options.inReplyToTweetId },
      });
      return result.data.id;
    }
    if (options?.quoteTweetId) {
      const result = await client.v2.tweet(text, {
        quote_tweet_id: options.quoteTweetId,
      });
      return result.data.id;
    }

    const result = await client.v2.tweet(text);
    return result.data.id;
  }

  /**
   * Post an original tweet (text only, no reply context)
   */
  async postTweet(
    credential: IReplyBotCredentialData,
    text: string,
  ): Promise<IReplyBotReplyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const contentId = await this.publishTwitterStatus(credential, text);
      const contentUrl = `https://x.com/${credential.username ?? 'i'}/status/${contentId}`;

      this.loggerService.log(`${url} success`, {
        contentId,
        platform: ReplyBotPlatform.TWITTER,
        textLength: text.length,
      });

      return { contentId, contentUrl, success: true };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';
      this.loggerService.error(`${url} failed`, { error: errorMessage });
      return { error: errorMessage, success: false };
    }
  }

  /**
   * Native X repost (retweet) without commentary.
   */
  async repostTweet(
    credential: IReplyBotCredentialData,
    tweetId: string,
  ): Promise<IReplyBotReplyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const client = this.createTwitterClient(credential);
      const me = await client.v2.me();
      await client.v2.retweet(me.data.id, tweetId);

      this.loggerService.log(`${url} success`, {
        platform: ReplyBotPlatform.TWITTER,
        tweetId,
      });

      return {
        contentId: tweetId,
        contentUrl: `https://x.com/${credential.username ?? 'i'}/status/${tweetId}`,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';
      this.loggerService.error(`${url} failed`, {
        error: errorMessage,
        tweetId,
      });
      return { error: errorMessage, success: false };
    }
  }

  /**
   * Post a quote tweet referencing another tweet
   */
  async postQuoteTweet(
    credential: IReplyBotCredentialData,
    quoteTweetId: string,
    text: string,
  ): Promise<IReplyBotReplyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const contentId = await this.publishTwitterStatus(credential, text, {
        quoteTweetId,
      });
      const contentUrl = `https://x.com/${credential.username ?? 'i'}/status/${contentId}`;

      this.loggerService.log(`${url} success`, {
        contentId,
        platform: ReplyBotPlatform.TWITTER,
        quoteTweetId,
        textLength: text.length,
      });

      return { contentId, contentUrl, success: true };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';
      this.loggerService.error(`${url} failed`, {
        error: errorMessage,
        quoteTweetId,
      });
      return { error: errorMessage, success: false };
    }
  }

  /**
   * Post a reply routed by platform
   */
  postReply(
    credential: IReplyBotCredentialData,
    targetContent: IReplyBotContentData,
    replyText: string,
  ): Promise<IReplyBotReplyResult> {
    const platformInput = credential.platform ?? ReplyBotPlatform.TWITTER;
    const platform = normalizeReplyBotPlatform(platformInput);

    switch (platform) {
      case ReplyBotPlatform.TWITTER:
        return this.postTwitterReply(credential, targetContent, replyText);
      case ReplyBotPlatform.INSTAGRAM:
        return this.postInstagramComment(credential, targetContent, replyText);
      case ReplyBotPlatform.YOUTUBE:
        return this.postYouTubeCommentReply(
          credential,
          targetContent,
          replyText,
        );
      default:
        return Promise.resolve({
          error: unsupportedReplyBotPlatformMessage(platformInput),
          success: false,
        });
    }
  }

  /**
   * Send a DM routed by platform
   */
  sendDm(
    credential: IReplyBotCredentialData,
    recipientUserId: string,
    message: string,
  ): Promise<IReplyBotDmResult> {
    const platformInput = credential.platform ?? ReplyBotPlatform.TWITTER;
    const platform = normalizeReplyBotPlatform(platformInput);

    switch (platform) {
      case ReplyBotPlatform.TWITTER:
        return this.sendTwitterDm(credential, recipientUserId, message);
      case ReplyBotPlatform.INSTAGRAM:
        return this.sendInstagramDm(credential, recipientUserId, message);
      default:
        return Promise.resolve({
          error: unsupportedReplyBotPlatformMessage(platformInput),
          success: false,
        });
    }
  }

  /**
   * Post a reply to a tweet
   */
  private async postTwitterReply(
    credential: IReplyBotCredentialData,
    targetContent: IReplyBotContentData,
    replyText: string,
  ): Promise<IReplyBotReplyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const contentId = await this.publishTwitterStatus(credential, replyText, {
        inReplyToTweetId: targetContent.id,
      });
      const contentUrl = `https://x.com/${targetContent.authorUsername}/status/${contentId}`;

      this.loggerService.log(`${url} success`, {
        contentId,
        inReplyTo: targetContent.id,
        platform: ReplyBotPlatform.TWITTER,
        replyLength: replyText.length,
      });

      return {
        contentId,
        contentUrl,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      this.loggerService.error(`${url} failed`, {
        error: errorMessage,
        platform: ReplyBotPlatform.TWITTER,
        targetContentId: targetContent.id,
      });

      return {
        error: errorMessage,
        success: false,
      };
    }
  }

  /**
   * Post a comment on Instagram media
   */
  private async postInstagramComment(
    credential: IReplyBotCredentialData,
    targetContent: IReplyBotContentData,
    replyText: string,
  ): Promise<IReplyBotReplyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (!credential.organizationId || !credential.brandId) {
        throw new Error('organizationId and brandId required for Instagram');
      }

      const result = await this.instagramService.postComment(
        credential.organizationId,
        credential.brandId,
        targetContent.id,
        replyText,
        credential.id,
      );

      this.loggerService.log(`${url} success`, {
        commentId: result.commentId,
        mediaId: targetContent.id,
        platform: ReplyBotPlatform.INSTAGRAM,
        replyLength: replyText.length,
      });

      return {
        contentId: result.commentId,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      this.loggerService.error(`${url} failed`, {
        error: errorMessage,
        mediaId: targetContent.id,
        platform: ReplyBotPlatform.INSTAGRAM,
      });

      return {
        error: errorMessage,
        success: false,
      };
    }
  }

  /**
   * Reply to a top-level YouTube comment (parentId = comment id).
   */
  private async postYouTubeCommentReply(
    credential: IReplyBotCredentialData,
    targetContent: IReplyBotContentData,
    replyText: string,
  ): Promise<IReplyBotReplyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (!credential.organizationId || !credential.brandId) {
        throw new Error('organizationId and brandId required for YouTube');
      }

      const youtubeService = this.resolveYoutubeService();
      if (!youtubeService) {
        throw new Error('YouTube integration is unavailable');
      }
      const result = await youtubeService.replyToComment(
        credential.organizationId,
        credential.brandId,
        targetContent.id,
        replyText,
        credential.id,
      );

      this.loggerService.log(`${url} success`, {
        commentId: result.commentId,
        parentCommentId: targetContent.id,
        platform: ReplyBotPlatform.YOUTUBE,
        replyLength: replyText.length,
      });

      return {
        contentId: result.commentId,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      this.loggerService.error(`${url} failed`, {
        error: errorMessage,
        parentCommentId: targetContent.id,
        platform: ReplyBotPlatform.YOUTUBE,
      });

      return {
        error: errorMessage,
        success: false,
      };
    }
  }

  private resolveYoutubeService(): YoutubeService | undefined {
    if (this.youtubeService) {
      return this.youtubeService;
    }
    try {
      return this.moduleRef?.get(YoutubeService, { strict: false });
    } catch {
      return undefined;
    }
  }

  /**
   * Send a Twitter DM
   */
  private async sendTwitterDm(
    credential: IReplyBotCredentialData,
    recipientUserId: string,
    message: string,
  ): Promise<IReplyBotDmResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const client = this.createTwitterClient(credential);

      await client.v2.sendDmToParticipant(recipientUserId, {
        text: message,
      });

      this.loggerService.log(`${url} success`, {
        messageLength: message.length,
        platform: ReplyBotPlatform.TWITTER,
        recipientUserId,
      });

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      if (
        errorMessage.includes('cannot send messages') ||
        errorMessage.includes('Direct message')
      ) {
        this.loggerService.warn(`${url} DM not allowed`, {
          error: errorMessage,
          platform: ReplyBotPlatform.TWITTER,
          recipientUserId,
        });
      } else {
        this.loggerService.error(`${url} failed`, {
          error: errorMessage,
          platform: ReplyBotPlatform.TWITTER,
          recipientUserId,
        });
      }

      return {
        error: errorMessage,
        success: false,
      };
    }
  }

  /**
   * Send an Instagram DM
   */
  private async sendInstagramDm(
    credential: IReplyBotCredentialData,
    recipientUserId: string,
    message: string,
  ): Promise<IReplyBotDmResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (!credential.organizationId || !credential.brandId) {
        throw new Error('organizationId and brandId required for Instagram');
      }

      const contentId = await this.instagramService.sendCommentReplyDm(
        credential.organizationId,
        credential.brandId,
        recipientUserId,
        message,
        credential.id,
      );

      this.loggerService.log(`${url} success`, {
        messageLength: message.length,
        platform: ReplyBotPlatform.INSTAGRAM,
        recipientUserId,
      });

      return { contentId: contentId ?? undefined, success: true };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      this.loggerService.error(`${url} failed`, {
        error: errorMessage,
        platform: ReplyBotPlatform.INSTAGRAM,
        recipientUserId,
      });

      return {
        error: errorMessage,
        success: false,
      };
    }
  }

  /**
   * Resolve a Twitter username to a user ID
   */
  async resolveTwitterUserId(
    credential: IReplyBotCredentialData,
    username: string,
  ): Promise<string | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const client = this.createTwitterClient(credential);
      const cleanUsername = username.replace(/^@/, '');
      const result = await client.v2.userByUsername(cleanUsername);

      if (!result.data?.id) {
        this.loggerService.warn(`${url} user not found`, {
          username: cleanUsername,
        });
        return null;
      }

      this.loggerService.log(`${url} resolved`, {
        userId: result.data.id,
        username: cleanUsername,
      });

      return result.data.id;
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';
      this.loggerService.error(`${url} failed`, {
        error: errorMessage,
        username,
      });
      return null;
    }
  }

  /**
   * Validate that a credential has the required tokens
   */
  validateCredential(credential: IReplyBotCredentialData): boolean {
    return Boolean(credential.accessToken);
  }
}
