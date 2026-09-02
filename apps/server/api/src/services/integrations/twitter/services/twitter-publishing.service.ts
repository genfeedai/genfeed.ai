import { Buffer } from 'node:buffer';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  type ChannelTargetSettings,
  readChannelSettingString,
} from '@genfeedai/api-types/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { TwitterApi } from 'twitter-api-v2';

interface TweetMediaOptions {
  media: {
    media_ids:
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string];
  };
  quote_tweet_id?: string;
  reply_settings?: string;
}

const TWITTER_REPLY_SETTINGS_BY_POLICY: Record<string, string> = {
  following: 'following',
  mentioned: 'mentionedUsers',
};

export function resolveTwitterReplySettings(
  settings: ChannelTargetSettings,
): string | undefined {
  const policy = readChannelSettingString(settings, 'replyPolicy');
  return policy === undefined
    ? undefined
    : TWITTER_REPLY_SETTINGS_BY_POLICY[policy];
}

type ResolveTwitterCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<{ accessToken?: string | null }>;

function requireAccessToken(value: string | null | undefined): string {
  if (!value) {
    throw new Error('Twitter credential is missing accessToken');
  }
  return value;
}

export class TwitterPublishingService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly resolveCredential: ResolveTwitterCredential,
  ) {}

  async uploadMedia(
    organizationId: string,
    brandId: string,
    mediaUrls: string[],
    caption: string,
    mediaType: 'image/jpeg' | 'video/mp4' = 'video/mp4',
    quoteTweetId?: string,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<string> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(
        requireAccessToken(credential.accessToken),
      );
      const userClient = new TwitterApi(accessToken);
      if (mediaUrls.length > 4) {
        throw new Error('Twitter supports maximum 4 images per tweet');
      }

      const mediaIds: string[] = [];
      for (const mediaUrl of mediaUrls) {
        const mediaResponse = await firstValueFrom(
          this.httpService.get(mediaUrl, { responseType: 'arraybuffer' }),
        );
        mediaIds.push(
          await userClient.v2.uploadMedia(Buffer.from(mediaResponse.data), {
            media_type: mediaType,
          }),
        );
      }

      const tweetOptions: TweetMediaOptions = {
        media: {
          media_ids: mediaIds as TweetMediaOptions['media']['media_ids'],
        },
      };
      if (quoteTweetId) {
        tweetOptions.quote_tweet_id = quoteTweetId;
      }
      const replySettings = resolveTwitterReplySettings(settings);
      if (replySettings) {
        tweetOptions.reply_settings = replySettings;
      }

      const tweetResponse = await userClient.v2.tweet(
        htmlToText(caption),
        tweetOptions,
      );
      const tweetId = tweetResponse?.data?.id;
      this.loggerService.log(`${url} success`, {
        mediaCount: mediaIds.length,
        tweetId,
      });
      return tweetId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async postTweet(
    organizationId: string,
    brandId: string,
    text: string,
    inReplyToTweetId?: string,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<string> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(
        requireAccessToken(credential.accessToken),
      );
      const userClient = new TwitterApi(accessToken);
      const tweetOptions: Record<string, unknown> = {};
      if (inReplyToTweetId) {
        tweetOptions.reply = { in_reply_to_tweet_id: inReplyToTweetId };
      }
      const replySettings = inReplyToTweetId
        ? undefined
        : resolveTwitterReplySettings(settings);
      if (replySettings) {
        tweetOptions.reply_settings = replySettings;
      }

      const tweetResponse = await userClient.v2.tweet(
        htmlToText(text),
        tweetOptions,
      );
      const tweetId = tweetResponse?.data?.id;
      this.loggerService.log(`${url} success`, { tweetId });
      return tweetId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async repostTweet(
    organizationId: string,
    brandId: string,
    tweetId: string,
    credentialId?: string,
  ): Promise<{ reposted: boolean; tweetId: string }> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(
        requireAccessToken(credential.accessToken),
      );
      const userClient = new TwitterApi(accessToken);
      const userId = (await userClient.v2.me()).data.id;
      await userClient.v2.retweet(userId, tweetId);
      this.loggerService.log(`${url} success`, { tweetId, userId });
      return { reposted: true, tweetId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
