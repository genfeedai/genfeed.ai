import type { ITwitterSearchResult } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { TwitterApi } from 'twitter-api-v2';
import {
  TwitterResponseMapper,
  type TwitterSearchResponse,
  type TwitterTrendResponse,
  type TwitterTrendResult,
  type TwitterUserResponse,
  type TwitterUsersResponse,
} from './twitter-response.mapper';

interface TwitterApiErrorShape {
  code?: number;
  message?: string;
  status?: number;
}

export interface TwitterResolvedUser {
  followersCount?: number;
  id: string;
  name?: string;
  username: string;
}

export class TwitterReadService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly responseMapper: TwitterResponseMapper,
    private readonly resolveClient: () => TwitterApi,
  ) {}

  async searchRecentTweets(
    query: string,
    options: { maxResults?: number; sortOrder?: 'relevancy' | 'recency' } = {},
  ): Promise<ITwitterSearchResult[]> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;
    const { maxResults = 10, sortOrder = 'relevancy' } = options;

    try {
      const result = await this.resolveClient().v2.search(query, {
        expansions: 'author_id',
        max_results: maxResults,
        sort_order: sortOrder,
        'tweet.fields': 'author_id,created_at,public_metrics,entities',
        'user.fields': 'username,name',
      });
      const tweets = this.responseMapper.mapSearchResults(
        result as unknown as TwitterSearchResponse,
      );
      this.loggerService.log(
        `${url} found ${tweets.length} tweets for query "${query}"`,
      );
      return tweets;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async getUserByUsername(
    username: string,
  ): Promise<TwitterResolvedUser | null> {
    const caller = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const result = (await this.resolveClient().v2.get(
        `users/by/username/${encodeURIComponent(username.replace(/^@/, ''))}`,
        { 'user.fields': 'public_metrics' },
      )) as TwitterUserResponse;
      return this.responseMapper.mapUser(result);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getUsers(
    path: string,
    maxResults = 10,
  ): Promise<TwitterResolvedUser[]> {
    const caller = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const result = (await this.resolveClient().v2.get(path, {
        max_results: Math.min(maxResults, 100),
        'user.fields': 'public_metrics',
      })) as TwitterUsersResponse;
      return this.responseMapper.mapUsers(result);
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async getTrends(
    organizationId?: string,
    brandId?: string,
    woeid = 1,
  ): Promise<TwitterTrendResult[]> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const response = await this.resolveClient().v1.trendsByPlace(woeid);
      return this.responseMapper.mapTrends(
        response as unknown as TwitterTrendResponse[],
        organizationId,
        brandId,
      );
    } catch (error: unknown) {
      const errorObject = error as TwitterApiErrorShape;
      const isAccessLevelError =
        errorObject?.code === 453 ||
        errorObject?.status === 403 ||
        Boolean(
          errorObject?.message &&
            (errorObject.message.includes('access level') ||
              errorObject.message.includes('453') ||
              errorObject.message.includes('different access level')),
        );

      if (isAccessLevelError) {
        this.loggerService.warn(
          `${url} requires X API credits (PAYG). Returning empty results.`,
          {
            code: errorObject?.code,
            error: errorObject?.message,
            solution:
              'Add X API credits to your Developer Console: https://docs.x.com/x-api/getting-started/pricing',
            status: errorObject?.status,
          },
        );
      } else {
        this.loggerService.error(`${url} failed`, error);
      }
      return [];
    }
  }
}
