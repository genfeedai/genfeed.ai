import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import type {
  DmSender,
  EngagementChecker,
  KeywordChecker,
  MentionChecker,
  NewFollowerChecker,
  NewLikeChecker,
  NewRepostChecker,
  ReplyPublisher,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Twitter Social Adapter
 *
 * Implements all 6 social workflow resolver interfaces using TwitterService.
 * Each method returns a bound function that can be injected directly into executors.
 *
 * Implemented:
 * - ReplyPublisher (postTweet with inReplyToTweetId)
 * - DmSender (sendCommentReplyDm)
 * - MentionChecker (searchRecentTweets with @username query)
 *
 * Implemented polling resolvers:
 * - NewFollowerChecker (GET /2/users/:id/followers)
 * - NewLikeChecker (GET /2/tweets/:id/liking_users)
 * - NewRepostChecker (GET /2/tweets/:id/retweeted_by)
 */
@Injectable()
export class TwitterSocialAdapter {
  private readonly logContext = 'TwitterSocialAdapter';

  constructor(
    private readonly twitterService: TwitterService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Posts a reply tweet using the Twitter API v2.
   * Supports text-only and media replies.
   */
  createReplyPublisher(): ReplyPublisher {
    return async (params) => {
      const {
        organizationId,
        brandId: explicitBrandId,
        userId,
        postId,
        text,
        mediaUrl,
      } = params;

      const brandId = explicitBrandId ?? userId;

      this.loggerService.debug(`${this.logContext} replying to tweet`, {
        brandId,
        organizationId,
        postId,
      });

      if (mediaUrl) {
        const tweetId = await this.twitterService.uploadMedia(
          organizationId,
          brandId,
          mediaUrl,
          text,
          'image/jpeg',
        );
        return {
          replyId: tweetId,
          replyUrl: `https://twitter.com/i/web/status/${tweetId}`,
        };
      }

      // Text-only reply using postTweet with inReplyToTweetId
      const tweetId = await this.twitterService.postTweet(
        organizationId,
        brandId,
        text,
        postId,
      );

      return {
        replyId: tweetId,
        replyUrl: `https://twitter.com/i/web/status/${tweetId}`,
      };
    };
  }

  /**
   * Sends a DM via Twitter API.
   */
  createDmSender(): DmSender {
    return async (params) => {
      const {
        organizationId,
        brandId: explicitBrandId,
        userId,
        recipientId,
        text,
      } = params;

      const brandId = explicitBrandId ?? userId;

      this.loggerService.debug(`${this.logContext} sending DM`, {
        brandId,
        organizationId,
        recipientId,
      });

      await this.twitterService.sendCommentReplyDm(
        organizationId,
        brandId,
        recipientId,
        text,
      );

      return { messageId: `tw_dm_${Date.now()}` };
    };
  }

  /**
   * Checks for new mentions using searchRecentTweets.
   * Returns the most recent mention newer than lastMentionId, or null if none.
   */
  createMentionChecker(): MentionChecker {
    return async (params) => {
      const {
        organizationId,
        platform,
        keywords,
        excludeKeywords,
        lastMentionId,
      } = params;

      this.loggerService.debug(`${this.logContext} checking mentions`, {
        lastMentionId,
        organizationId,
        platform,
      });

      // Get the brand's Twitter username from credentials
      const credential = await this.credentialsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: 'twitter',
      });

      if (!credential?.platformUsername) {
        this.loggerService.warn(
          `${this.logContext} no Twitter credential found`,
          { organizationId },
        );
        return null;
      }

      let query = `@${credential.platformUsername}`;
      if (keywords?.length) {
        query += ` (${keywords.join(' OR ')})`;
      }
      if (excludeKeywords?.length) {
        query += ` ${excludeKeywords.map((k) => `-${k}`).join(' ')}`;
      }

      const results = await this.twitterService.searchRecentTweets(query, {
        maxResults: 10,
        sortOrder: 'recency',
      });

      // Find the newest mention that's newer than lastMentionId
      const newMention = results.find(
        (tweet) => !lastMentionId || tweet.id > lastMentionId,
      );

      if (!newMention) {
        return null;
      }

      return {
        authorId: newMention.authorUsername,
        authorUsername: newMention.authorUsername,
        mentionedAt: newMention.createdAt,
        platform: 'twitter' as const,
        postId: newMention.id,
        postUrl: `https://twitter.com/i/web/status/${newMention.id}`,
        text: newMention.text,
      };
    };
  }

  /**
   * Checks for new followers.
   */
  createFollowerChecker(): NewFollowerChecker {
    return async (params) => {
      const { lastFollowerId, minFollowerCount, organizationId } = params;

      const credential = await this.credentialsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: 'twitter',
      });

      if (!credential?.platformUsername) {
        this.loggerService.warn(
          `${this.logContext} follower check skipped — no platformUsername configured`,
          { organizationId },
        );
        return null;
      }

      const user = await this.twitterService.getUserByUsername(
        credential.platformUsername,
      );

      if (!user) {
        return null;
      }

      const followers = await this.twitterService.getFollowers(user.id, {
        maxResults: 25,
      });

      let newestFollower: (typeof followers)[number] | null = null;

      for (const follower of followers) {
        if (
          !TwitterSocialAdapter.isNewerTwitterId(follower.id, lastFollowerId)
        ) {
          continue;
        }

        if (
          typeof minFollowerCount === 'number' &&
          (follower.followersCount ?? 0) < minFollowerCount
        ) {
          continue;
        }

        if (
          !newestFollower ||
          TwitterSocialAdapter.compareTwitterIds(
            follower.id,
            newestFollower.id,
          ) > 0
        ) {
          newestFollower = follower;
        }
      }

      if (!newestFollower) {
        return null;
      }

      return {
        followedAt: new Date().toISOString(),
        followerDisplayName: newestFollower.name,
        followerFollowerCount: newestFollower.followersCount,
        followerId: newestFollower.id,
        followerUsername: newestFollower.username,
        platform: 'twitter',
      };
    };
  }

  /**
   * Checks for new likes on a tweet.
   */
  createLikeChecker(): NewLikeChecker {
    return async (params) => {
      const { lastLikeId, minLikerFollowerCount, postIds } = params;

      if (!postIds || postIds.length === 0) {
        this.loggerService.warn(
          `${this.logContext} like check skipped — no postIds configured`,
          { organizationId: params.organizationId },
        );
        return null;
      }

      let latestLike: {
        liker: Awaited<
          ReturnType<TwitterService['getTweetLikingUsers']>
        >[number];
        postId: string;
      } | null = null;

      for (const postId of postIds) {
        const likingUsers = await this.twitterService.getTweetLikingUsers(
          postId,
          {
            maxResults: 25,
          },
        );

        for (const liker of likingUsers) {
          if (!TwitterSocialAdapter.isNewerTwitterId(liker.id, lastLikeId)) {
            continue;
          }

          if (
            typeof minLikerFollowerCount === 'number' &&
            (liker.followersCount ?? 0) < minLikerFollowerCount
          ) {
            continue;
          }

          if (
            !latestLike ||
            TwitterSocialAdapter.compareTwitterIds(
              liker.id,
              latestLike.liker.id,
            ) > 0
          ) {
            latestLike = { liker, postId };
          }
        }
      }

      if (!latestLike) {
        return null;
      }

      return {
        likedAt: new Date().toISOString(),
        likerId: latestLike.liker.id,
        likerUsername: latestLike.liker.username,
        platform: 'twitter',
        postId: latestLike.postId,
        postUrl: `https://twitter.com/i/web/status/${latestLike.postId}`,
      };
    };
  }

  /**
   * Checks for new reposts (retweets) on a tweet.
   */
  createRepostChecker(): NewRepostChecker {
    return async (params) => {
      const { lastRepostId, minReposterFollowerCount, postIds } = params;

      if (!postIds || postIds.length === 0) {
        this.loggerService.warn(
          `${this.logContext} repost check skipped — no postIds configured`,
          { organizationId: params.organizationId },
        );
        return null;
      }

      let latestRepost: {
        postId: string;
        reposter: Awaited<
          ReturnType<TwitterService['getTweetRetweetedBy']>
        >[number];
      } | null = null;

      for (const postId of postIds) {
        const reposters = await this.twitterService.getTweetRetweetedBy(
          postId,
          {
            maxResults: 25,
          },
        );

        for (const reposter of reposters) {
          if (
            !TwitterSocialAdapter.isNewerTwitterId(reposter.id, lastRepostId)
          ) {
            continue;
          }

          if (
            typeof minReposterFollowerCount === 'number' &&
            (reposter.followersCount ?? 0) < minReposterFollowerCount
          ) {
            continue;
          }

          if (
            !latestRepost ||
            TwitterSocialAdapter.compareTwitterIds(
              reposter.id,
              latestRepost.reposter.id,
            ) > 0
          ) {
            latestRepost = { postId, reposter };
          }
        }
      }

      if (!latestRepost) {
        return null;
      }

      return {
        platform: 'twitter',
        postId: latestRepost.postId,
        postUrl: `https://twitter.com/i/web/status/${latestRepost.postId}`,
        repostedAt: new Date().toISOString(),
        reposterId: latestRepost.reposter.id,
        reposterUsername: latestRepost.reposter.username,
      };
    };
  }

  /**
   * Creates a KeywordChecker for KeywordTriggerExecutor.
   * Searches Twitter for tweets matching keywords using Twitter API v2 search.
   */
  createKeywordChecker(): KeywordChecker {
    return async (params) => {
      const {
        caseSensitive,
        excludeKeywords,
        keywords,
        lastPostId,
        matchMode,
      } = params;

      if (!keywords || keywords.length === 0) {
        return null;
      }

      const query = this.buildKeywordSearchQuery(keywords, excludeKeywords);
      const tweets = await this.twitterService.searchRecentTweets(query, {
        maxResults: 20,
        sortOrder: 'recency',
      });

      let latestMatch: {
        matchedKeyword: string;
        tweet: (typeof tweets)[number];
      } | null = null;

      for (const tweet of tweets) {
        if (!TwitterSocialAdapter.isNewerTwitterId(tweet.id, lastPostId)) {
          continue;
        }

        const matchedKeyword = this.matchKeyword({
          caseSensitive,
          excludeKeywords,
          keywords,
          matchMode,
          text: tweet.text,
        });

        if (!matchedKeyword) {
          continue;
        }

        if (
          !latestMatch ||
          TwitterSocialAdapter.compareTwitterIds(
            tweet.id,
            latestMatch.tweet.id,
          ) > 0
        ) {
          latestMatch = { matchedKeyword, tweet };
        }
      }

      if (!latestMatch) {
        return null;
      }

      return {
        authorId: latestMatch.tweet.authorUsername,
        authorUsername: latestMatch.tweet.authorUsername,
        detectedAt: latestMatch.tweet.createdAt,
        matchedKeyword: latestMatch.matchedKeyword,
        platform: 'twitter',
        postId: latestMatch.tweet.id,
        postUrl: `https://twitter.com/i/web/status/${latestMatch.tweet.id}`,
        text: latestMatch.tweet.text,
      };
    };
  }

  /**
   * Creates an EngagementChecker for EngagementTriggerExecutor.
   * Monitors engagement metrics on specific tweets.
   */
  createEngagementChecker(): EngagementChecker {
    return async (params) => {
      const { lastCheckedPostId, metricType, postIds, threshold } = params;

      if (!postIds || postIds.length === 0) {
        return null;
      }

      const metricsByPost =
        await this.twitterService.getMediaAnalyticsBatch(postIds);

      let latestHit: {
        currentValue: number;
        postId: string;
      } | null = null;

      for (const postId of postIds) {
        const metrics = metricsByPost.get(postId);
        if (!metrics) {
          continue;
        }

        if (!TwitterSocialAdapter.isNewerTwitterId(postId, lastCheckedPostId)) {
          continue;
        }

        const currentValue = this.getEngagementMetricValue(metricType, metrics);
        if (currentValue < threshold) {
          continue;
        }

        if (
          !latestHit ||
          TwitterSocialAdapter.compareTwitterIds(postId, latestHit.postId) > 0
        ) {
          latestHit = { currentValue, postId };
        }
      }

      if (!latestHit) {
        return null;
      }

      return {
        currentValue: latestHit.currentValue,
        metricType,
        platform: 'twitter',
        postId: latestHit.postId,
        postUrl: `https://twitter.com/i/web/status/${latestHit.postId}`,
        threshold,
        triggeredAt: new Date().toISOString(),
      };
    };
  }

  private static compareTwitterIds(left: string, right: string): number {
    try {
      const leftId = BigInt(left);
      const rightId = BigInt(right);

      if (leftId === rightId) {
        return 0;
      }

      return leftId > rightId ? 1 : -1;
    } catch {
      if (left === right) {
        return 0;
      }

      return left > right ? 1 : -1;
    }
  }

  private static isNewerTwitterId(
    candidateId: string,
    lastSeenId: string | null,
  ): boolean {
    if (!lastSeenId) {
      return true;
    }

    return TwitterSocialAdapter.compareTwitterIds(candidateId, lastSeenId) > 0;
  }

  private buildKeywordSearchQuery(
    keywords: string[],
    excludeKeywords: string[],
  ): string {
    const includeClause = keywords
      .map((keyword) => `"${keyword.trim()}"`)
      .join(' OR ');

    const excludeClause = excludeKeywords
      .map((keyword) => `-"${keyword.trim()}"`)
      .join(' ');

    return excludeClause
      ? `(${includeClause}) ${excludeClause}`.trim()
      : `(${includeClause})`;
  }

  private matchKeyword(params: {
    text: string;
    keywords: string[];
    excludeKeywords: string[];
    matchMode: string;
    caseSensitive: boolean;
  }): string | null {
    const { caseSensitive, excludeKeywords, keywords, matchMode, text } =
      params;

    const sourceText = caseSensitive ? text : text.toLowerCase();
    const normalizedExclude = excludeKeywords.map((keyword) =>
      caseSensitive ? keyword : keyword.toLowerCase(),
    );

    if (normalizedExclude.some((keyword) => sourceText.includes(keyword))) {
      return null;
    }

    const normalizedKeywords = keywords.map((keyword) =>
      caseSensitive ? keyword : keyword.toLowerCase(),
    );

    for (const keyword of normalizedKeywords) {
      if (matchMode === 'exact') {
        if (sourceText === keyword || sourceText.includes(keyword)) {
          return keyword;
        }
        continue;
      }

      if (matchMode === 'regex') {
        try {
          const regex = new RegExp(keyword, caseSensitive ? 'g' : 'gi');
          if (regex.test(text)) {
            return keyword;
          }
        } catch {
          if (sourceText.includes(keyword)) {
            return keyword;
          }
        }
        continue;
      }

      if (sourceText.includes(keyword)) {
        return keyword;
      }
    }

    return null;
  }

  private getEngagementMetricValue(
    metricType: string,
    metrics: {
      comments: number;
      likes: number;
      retweets?: number;
      views: number;
    },
  ): number {
    switch (metricType) {
      case 'likes':
        return metrics.likes;
      case 'comments':
        return metrics.comments;
      case 'shares':
        return metrics.retweets ?? 0;
      case 'views':
        return metrics.views;
      default:
        return 0;
    }
  }
}
