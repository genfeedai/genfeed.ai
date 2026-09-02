import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { TwitterApi } from 'twitter-api-v2';
import {
  type TwitterAnalyticsResponse,
  type TwitterAnalyticsResult,
  TwitterResponseMapper,
} from './twitter-response.mapper';

interface TwitterApiErrorShape {
  code?: number;
  data?: unknown;
  headers?: Record<string, string>;
  rateLimit?: { limit?: string; remaining?: string; reset?: string };
  rateLimitReset?: Date;
  rateLimitWaitMs?: number;
}

export class TwitterAnalyticsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly responseMapper: TwitterResponseMapper,
    private readonly resolveDefaultClient: () => TwitterApi,
  ) {}

  async getMediaAnalytics(
    tweetId: string,
    accessToken?: string,
    accessTokenSecret?: string,
  ): Promise<TwitterAnalyticsResult> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const client = this.resolveClient(accessToken, accessTokenSecret);
      const fields = 'public_metrics,non_public_metrics,organic_metrics';
      const response = await client.v2.get('tweets', {
        expansions: 'attachments.media_keys',
        ids: tweetId,
        'media.fields': `${fields},type`,
        'tweet.fields': `${fields},attachments`,
      });

      return this.responseMapper.mapAnalytics(
        response as unknown as TwitterAnalyticsResponse,
      );
    } catch (error: unknown) {
      this.handleError(url, error);
    }
  }

  async getMediaAnalyticsBatch(
    tweetIds: string[],
    accessToken?: string,
    accessTokenSecret?: string,
  ): Promise<Map<string, TwitterAnalyticsResult>> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;
    if (tweetIds.length === 0) {
      return new Map();
    }
    if (tweetIds.length > 100) {
      throw new Error('Twitter API supports maximum 100 tweet IDs per request');
    }

    try {
      const client = this.resolveClient(accessToken, accessTokenSecret);
      const fields = 'public_metrics,non_public_metrics,organic_metrics';
      const response = await client.v2.get('tweets', {
        expansions: 'attachments.media_keys',
        ids: tweetIds.join(','),
        'media.fields': `${fields},type`,
        'tweet.fields': `${fields},attachments`,
      });
      this.loggerService.log('Twitter API  client.v2.get tweets', response);
      const results = this.responseMapper.mapAnalyticsBatch(
        response as unknown as TwitterAnalyticsResponse,
      );
      this.loggerService.log(
        `${url} success - fetched analytics for ${results.size} tweets`,
      );
      return results;
    } catch (error: unknown) {
      this.handleError(url, error);
    }
  }

  private resolveClient(
    accessToken?: string,
    accessTokenSecret?: string,
  ): TwitterApi {
    if (!accessToken || !accessTokenSecret) {
      return this.resolveDefaultClient();
    }

    return new TwitterApi({
      // @ts-expect-error TS2769 -- twitter-api-v2 accepts OAuth 1.0a fields.
      accessSecret: accessTokenSecret,
      accessToken,
      appKey: this.configService.get('TWITTER_CONSUMER_KEY'),
      appSecret: this.configService.get('TWITTER_CONSUMER_SECRET'),
    });
  }

  private handleError(url: string, error: unknown): never {
    const errorObject = error as TwitterApiErrorShape;
    if (errorObject?.rateLimit || errorObject?.code === 429) {
      const rateLimit = errorObject.rateLimit || {
        limit: errorObject.headers?.['x-rate-limit-limit'],
        remaining: errorObject.headers?.['x-rate-limit-remaining'],
        reset: errorObject.headers?.['x-rate-limit-reset'],
      };
      if (rateLimit.reset) {
        const resetTime = new Date(parseInt(rateLimit.reset, 10) * 1000);
        const waitTime = Math.max(0, resetTime.getTime() - Date.now());
        errorObject.rateLimitReset = resetTime;
        errorObject.rateLimitWaitMs = waitTime;
        this.loggerService.warn(
          `${url} rate limited - reset at ${resetTime.toISOString()} (${Math.round(waitTime / 1000)}s wait)`,
          { rateLimit },
        );
      }
      throw error;
    }

    this.loggerService.error(`${url} failed`, errorObject?.data || errorObject);
    throw error;
  }
}
