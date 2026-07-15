import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
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
import { Injectable } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';

@Injectable()
export class BotActionExecutorService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly instagramService: InstagramService,
  ) {}

  /**
   * Create a Twitter client with user credentials.
   * Tokens are expected to be plaintext — callers must decrypt before building
   * IReplyBotCredentialData (decrypt at the credential-loading boundary).
   */
  private createTwitterClient(credential: IReplyBotCredentialData): TwitterApi {
    const accessSecret =
      credential.accessTokenSecret ?? credential.refreshToken ?? null;

    return new TwitterApi({
      accessSecret,
      accessToken: credential.accessToken,
      appKey: this.configService.get('TWITTER_CONSUMER_KEY'),
      appSecret: this.configService.get('TWITTER_CONSUMER_SECRET'),
    } as unknown as ConstructorParameters<typeof TwitterApi>[0]);
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
      const client = this.createTwitterClient(credential);
      const result = await client.v2.tweet(text);
      const contentId = result.data.id;
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
   * Post a quote tweet referencing another tweet
   */
  async postQuoteTweet(
    credential: IReplyBotCredentialData,
    quoteTweetId: string,
    text: string,
  ): Promise<IReplyBotReplyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const client = this.createTwitterClient(credential);
      const result = await client.v2.tweet(text, {
        quote_tweet_id: quoteTweetId,
      });
      const contentId = result.data.id;
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
      const client = this.createTwitterClient(credential);

      const result = await client.v2.tweet(replyText, {
        reply: {
          in_reply_to_tweet_id: targetContent.id,
        },
      });

      const contentId = result.data.id;
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

      await this.instagramService.sendCommentReplyDm(
        credential.organizationId,
        credential.brandId,
        recipientUserId,
        message,
      );

      this.loggerService.log(`${url} success`, {
        messageLength: message.length,
        platform: ReplyBotPlatform.INSTAGRAM,
        recipientUserId,
      });

      return { success: true };
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
   * Post a reply and optionally send a DM
   */
  async executeActions(
    credential: IReplyBotCredentialData,
    targetContent: IReplyBotContentData,
    replyText: string,
    dmText?: string,
    dmDelayMs: number = 60000,
  ): Promise<{
    reply: IReplyBotReplyResult;
    dm?: IReplyBotDmResult;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const replyResult = await this.postReply(
      credential,
      targetContent,
      replyText,
    );

    if (!replyResult.success || !dmText) {
      return { reply: replyResult };
    }

    if (dmDelayMs > 0) {
      await this.delay(dmDelayMs);
    }

    const dmResult = await this.sendDm(
      credential,
      targetContent.authorId,
      dmText,
    );

    this.loggerService.log(`${url} completed`, {
      dmSuccess: dmResult.success,
      platform: credential.platform || ReplyBotPlatform.TWITTER,
      replySuccess: replyResult.success,
    });

    return {
      dm: dmResult,
      reply: replyResult,
    };
  }

  /**
   * Delay helper for natural-looking DM timing
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate that a credential has the required tokens
   */
  validateCredential(credential: IReplyBotCredentialData): boolean {
    return !!(
      credential.accessToken &&
      (credential.accessTokenSecret || credential.refreshToken)
    );
  }
}
