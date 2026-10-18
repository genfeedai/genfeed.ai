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

/** Readable by any client, including the app-only bearer. */
const PUBLIC_METRIC_FIELDS = 'public_metrics';

/**
 * `non_public_metrics` and `organic_metrics` need a user-context token and only
 * cover the authenticating account's own posts from the last 30 days.
 */
const USER_CONTEXT_METRIC_FIELDS =
  'public_metrics,non_public_metrics,organic_metrics';

export class TwitterAnalyticsService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly responseMapper: TwitterResponseMapper,
    private readonly resolveDefaultClient: () => TwitterApi,
  ) {}

  /**
   * @param accessToken Decrypted OAuth2 user access token. Without one the app
   * bearer is used and only public metrics are requested.
   */
  async getMediaAnalytics(
    tweetId: string,
    accessToken?: string,
  ): Promise<TwitterAnalyticsResult> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.fetchTweetMetrics([tweetId], accessToken);
      return this.responseMapper.mapAnalytics(response);
    } catch (error: unknown) {
      this.handleError(url, error);
    }
  }

  /**
   * @param accessToken Decrypted OAuth2 user access token. Without one the app
   * bearer is used and only public metrics are requested.
   */
  async getMediaAnalyticsBatch(
    tweetIds: string[],
    accessToken?: string,
  ): Promise<Map<string, TwitterAnalyticsResult>> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;
    if (tweetIds.length === 0) {
      return new Map();
    }
    if (tweetIds.length > 100) {
      throw new Error('Twitter API supports maximum 100 tweet IDs per request');
    }

    try {
      const response = await this.fetchTweetMetrics(tweetIds, accessToken);
      this.loggerService.log('Twitter API  client.v2.get tweets', response);
      const results = this.responseMapper.mapAnalyticsBatch(response);
      this.loggerService.log(
        `${url} success - fetched analytics for ${results.size} tweets`,
      );
      return results;
    } catch (error: unknown) {
      this.handleError(url, error);
    }
  }

  private async fetchTweetMetrics(
    tweetIds: string[],
    accessToken?: string,
  ): Promise<TwitterAnalyticsResponse> {
    if (!accessToken) {
      return this.requestTweetMetrics(
        this.resolveDefaultClient(),
        tweetIds,
        PUBLIC_METRIC_FIELDS,
      );
    }

    // OAuth2 user-context bearer: the only client X serves private metrics to.
    const client = new TwitterApi(accessToken);
    const response = await this.requestTweetMetrics(
      client,
      tweetIds,
      USER_CONTEXT_METRIC_FIELDS,
    );

    // X leaves a post out of `data` when it refuses the private fields for it
    // (older than 30 days, or not the account's own). Those posts still have
    // public metrics, so request them again without the private fields.
    const returnedIds = new Set((response.data ?? []).map((tweet) => tweet.id));
    const missingIds = tweetIds.filter((id) => !returnedIds.has(id));
    if (missingIds.length === 0) {
      return response;
    }

    const fallback = await this.requestTweetMetrics(
      client,
      missingIds,
      PUBLIC_METRIC_FIELDS,
    );
    return {
      data: [...(response.data ?? []), ...(fallback.data ?? [])],
      includes: {
        media: [
          ...(response.includes?.media ?? []),
          ...(fallback.includes?.media ?? []),
        ],
      },
    };
  }

  private requestTweetMetrics(
    client: TwitterApi,
    tweetIds: string[],
    fields: string,
  ): Promise<TwitterAnalyticsResponse> {
    return client.v2.get<TwitterAnalyticsResponse>('tweets', {
      expansions: 'attachments.media_keys',
      ids: tweetIds.join(','),
      'media.fields': `${fields},type`,
      'tweet.fields': `${fields},attachments`,
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
