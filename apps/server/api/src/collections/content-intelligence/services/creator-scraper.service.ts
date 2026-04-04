import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import {
  ContentIntelligencePlatform,
  CreatorAnalysisStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

export interface ScrapedPost {
  id: string;
  text: string;
  url?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  publishedAt: Date;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagementRate: number;
  hashtags: string[];
}

export interface ScrapedCreatorProfile {
  handle: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  followerCount: number;
  followingCount: number;
}

export interface ScrapeResult {
  profile: ScrapedCreatorProfile;
  posts: ScrapedPost[];
}

/** Apify curious_coder/linkedin-profile-scraper profile result */
interface LinkedInProfileResult {
  fullName?: string;
  firstName?: string;
  headline?: string;
  profilePicture?: string;
  followersCount?: number;
  connectionsCount?: number;
  posts?: LinkedInPostData[];
}

/** Apify curious_coder/linkedin-profile-scraper post data */
interface LinkedInPostData {
  text?: string;
  postUrl?: string;
  postedAt?: string;
  reactionCount?: number;
  commentCount?: number;
  shareCount?: number;
  impressionCount?: number;
}

interface TwitterUserData {
  profileImageUrl?: string;
  description?: string;
  name?: string;
  followersCount?: number;
  followingCount?: number;
}

interface TwitterTweetData {
  id: string;
  createdAt?: string;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  text?: string;
  user?: TwitterUserData;
  viewCount?: number;
}

interface InstagramPostData {
  id: string;
  caption?: string;
  commentsCount?: number;
  hashtags?: string[];
  likesCount?: number;
  timestamp?: string;
  url?: string;
  videoViewCount?: number;
}

interface InstagramProfileResult {
  biography?: string;
  followersCount?: number;
  followingCount?: number;
  fullName?: string;
  posts?: InstagramPostData[];
  profilePicUrl?: string;
}

interface TikTokAuthorData {
  avatar?: string;
  fans?: number;
  following?: number;
  nickName?: string;
  signature?: string;
}

interface TikTokHashtagData {
  name?: string;
}

interface TikTokVideoData {
  authorMeta?: TikTokAuthorData;
  commentCount?: number;
  createTime?: number;
  diggCount?: number;
  hashtags?: TikTokHashtagData[];
  id: string;
  playCount?: number;
  shareCount?: number;
  text?: string;
  webVideoUrl?: string;
}

@Injectable()
export class CreatorScraperService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly apifyService: ApifyService,
    private readonly contentIntelligenceService: ContentIntelligenceService,
    private readonly logger: LoggerService,
  ) {}

  async scrapeCreator(
    creatorId: Types.ObjectId | string,
  ): Promise<ScrapeResult | null> {
    const creator = await this.contentIntelligenceService.findOne({
      _id: creatorId,
      isDeleted: false,
    });

    if (!creator) {
      this.logger.error(`${this.constructorName}: Creator not found`, {
        creatorId,
      });
      return null;
    }

    try {
      // Update status to scraping
      await this.contentIntelligenceService.updateStatus(
        creatorId,
        CreatorAnalysisStatus.SCRAPING,
      );

      let result: ScrapeResult;

      switch (creator.platform) {
        case ContentIntelligencePlatform.TWITTER:
          result = await this.scrapeTwitter(
            creator.handle,
            creator.scrapeConfig.maxPosts,
          );
          break;
        case ContentIntelligencePlatform.LINKEDIN:
          result = await this.scrapeLinkedIn(
            creator.handle,
            creator.scrapeConfig.maxPosts,
          );
          break;
        case ContentIntelligencePlatform.INSTAGRAM:
          result = await this.scrapeInstagram(
            creator.handle,
            creator.scrapeConfig.maxPosts,
          );
          break;
        case ContentIntelligencePlatform.TIKTOK:
          result = await this.scrapeTikTok(
            creator.handle,
            creator.scrapeConfig.maxPosts,
          );
          break;
        default:
          throw new Error(`Unsupported platform: ${creator.platform}`);
      }

      // Update creator profile with scraped data
      await this.contentIntelligenceService.updateCreatorProfile(creatorId, {
        avatarUrl: result.profile.avatarUrl,
        bio: result.profile.bio,
        displayName: result.profile.displayName,
        followerCount: result.profile.followerCount,
        followingCount: result.profile.followingCount,
      });

      // Update status to analyzing
      await this.contentIntelligenceService.updateStatus(
        creatorId,
        CreatorAnalysisStatus.ANALYZING,
      );

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`${this.constructorName}: Scraping failed`, {
        creatorId,
        error: errorMessage,
        handle: creator.handle,
        platform: creator.platform,
      });

      await this.contentIntelligenceService.updateStatus(
        creatorId,
        CreatorAnalysisStatus.FAILED,
        errorMessage,
      );

      return null;
    }
  }

  async scrapeByPlatform(
    platform: ContentIntelligencePlatform,
    handle: string,
    maxPosts: number,
  ): Promise<ScrapeResult> {
    switch (platform) {
      case ContentIntelligencePlatform.TWITTER:
        return this.scrapeTwitter(handle, maxPosts);
      case ContentIntelligencePlatform.LINKEDIN:
        return this.scrapeLinkedIn(handle, maxPosts);
      case ContentIntelligencePlatform.INSTAGRAM:
        return this.scrapeInstagram(handle, maxPosts);
      case ContentIntelligencePlatform.TIKTOK:
        return this.scrapeTikTok(handle, maxPosts);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async scrapeTwitter(
    handle: string,
    maxPosts: number,
  ): Promise<ScrapeResult> {
    this.logger.log(`${this.constructorName}: Scraping Twitter`, {
      handle,
      maxPosts,
    });

    try {
      const tweets = await this.apifyService.runActor<TwitterTweetData>(
        'quacker/twitter-scraper',
        {
          handles: [handle],
          maxTweets: maxPosts,
          onlyVerified: false,
          proxyConfiguration: { useApifyProxy: true },
        },
      );

      const profile: ScrapedCreatorProfile = {
        avatarUrl: tweets[0]?.user?.profileImageUrl,
        bio: tweets[0]?.user?.description,
        displayName: tweets[0]?.user?.name || handle,
        followerCount: tweets[0]?.user?.followersCount || 0,
        followingCount: tweets[0]?.user?.followingCount || 0,
        handle,
      };

      const posts: ScrapedPost[] = tweets.map((tweet) => {
        const likes = tweet.likeCount || 0;
        const comments = tweet.replyCount || 0;
        const shares = tweet.retweetCount || 0;
        const views = tweet.viewCount || likes * 10;
        const engagementRate =
          views > 0 ? ((likes + comments + shares) / views) * 100 : 0;

        return {
          comments,
          engagementRate: Math.round(engagementRate * 100) / 100,
          hashtags: this.extractHashtags(tweet.text || ''),
          id: tweet.id,
          likes,
          publishedAt: new Date(tweet.createdAt || Date.now()),
          shares,
          text: tweet.text || '',
          url: `https://twitter.com/${handle}/status/${tweet.id}`,
          views,
        };
      });

      return { posts, profile };
    } catch (error) {
      this.logger.error(`${this.constructorName}: Twitter scrape failed`, {
        error,
        handle,
      });
      throw error;
    }
  }

  private async scrapeLinkedIn(
    handle: string,
    maxPosts: number,
  ): Promise<ScrapeResult> {
    this.logger.log(`${this.constructorName}: Scraping LinkedIn`, {
      handle,
      maxPosts,
    });

    try {
      const results = await this.apifyService.runActor<LinkedInProfileResult>(
        'curious_coder/linkedin-profile-scraper',
        {
          maxPosts,
          profileUrls: [`https://linkedin.com/in/${handle}`],
          proxyConfiguration: { useApifyProxy: true },
        },
      );

      const profileData = results[0];
      const profile: ScrapedCreatorProfile = {
        avatarUrl: profileData?.profilePicture,
        bio: profileData?.headline,
        displayName: profileData?.fullName || handle,
        followerCount: profileData?.followersCount || 0,
        followingCount: profileData?.connectionsCount || 0,
        handle,
      };

      const scrapedPosts: ScrapedPost[] = (profileData?.posts || []).map(
        (post: LinkedInPostData) => {
          const likes = post.reactionCount || 0;
          const comments = post.commentCount || 0;
          const shares = post.shareCount || 0;
          const views = post.impressionCount || likes * 20;
          const engagementRate =
            views > 0 ? ((likes + comments + shares) / views) * 100 : 0;

          return {
            comments,
            engagementRate: Math.round(engagementRate * 100) / 100,
            hashtags: this.extractHashtags(post.text || ''),
            id: post.postUrl || String(Date.now()),
            likes,
            publishedAt: new Date(post.postedAt || Date.now()),
            shares,
            text: post.text || '',
            url: post.postUrl,
            views,
          };
        },
      );

      return { posts: scrapedPosts, profile };
    } catch (error) {
      this.logger.error(`${this.constructorName}: LinkedIn scrape failed`, {
        error,
        handle,
      });
      throw error;
    }
  }

  private async scrapeInstagram(
    handle: string,
    maxPosts: number,
  ): Promise<ScrapeResult> {
    this.logger.log(`${this.constructorName}: Scraping Instagram`, {
      handle,
      maxPosts,
    });

    try {
      const results = await this.apifyService.runActor<InstagramProfileResult>(
        'apify/instagram-scraper',
        {
          directUrls: [`https://instagram.com/${handle}`],
          resultsLimit: maxPosts,
          resultsType: 'posts',
        },
      );

      const userInfo = results[0];
      const profile: ScrapedCreatorProfile = {
        avatarUrl: userInfo?.profilePicUrl,
        bio: userInfo?.biography,
        displayName: userInfo?.fullName || handle,
        followerCount: userInfo?.followersCount || 0,
        followingCount: userInfo?.followingCount || 0,
        handle,
      };

      const postsSource: InstagramPostData[] =
        userInfo?.posts && userInfo.posts.length > 0
          ? userInfo.posts
          : (results as unknown as InstagramPostData[]);

      const posts: ScrapedPost[] = postsSource.map((post) => {
        const likes = post.likesCount || 0;
        const comments = post.commentsCount || 0;
        const shares = 0;
        const views = post.videoViewCount || likes * 15;
        const engagementRate =
          views > 0 ? ((likes + comments) / views) * 100 : 0;

        return {
          comments,
          engagementRate: Math.round(engagementRate * 100) / 100,
          hashtags: post.hashtags || [],
          id: post.id,
          likes,
          mediaType: this.extractMediaType(post),
          mediaUrl: this.extractMediaUrl(post),
          publishedAt: new Date(post.timestamp || Date.now()),
          shares,
          text: post.caption || '',
          url: post.url,
          views,
        };
      });

      return { posts, profile };
    } catch (error) {
      this.logger.error(`${this.constructorName}: Instagram scrape failed`, {
        error,
        handle,
      });
      throw error;
    }
  }

  private async scrapeTikTok(
    handle: string,
    maxPosts: number,
  ): Promise<ScrapeResult> {
    this.logger.log(`${this.constructorName}: Scraping TikTok`, {
      handle,
      maxPosts,
    });

    try {
      const videos = await this.apifyService.runActor<TikTokVideoData>(
        'clockworks/tiktok-profile-scraper',
        {
          profiles: [handle],
          resultsPerPage: maxPosts,
        },
      );

      const userInfo = videos[0]?.authorMeta;
      const profile: ScrapedCreatorProfile = {
        avatarUrl: userInfo?.avatar,
        bio: userInfo?.signature,
        displayName: userInfo?.nickName || handle,
        followerCount: userInfo?.fans || 0,
        followingCount: userInfo?.following || 0,
        handle,
      };

      const posts: ScrapedPost[] = videos.map((video) => {
        const likes = video.diggCount || 0;
        const comments = video.commentCount || 0;
        const shares = video.shareCount || 0;
        const views = video.playCount || 0;
        const engagementRate =
          views > 0 ? ((likes + comments + shares) / views) * 100 : 0;

        return {
          comments,
          engagementRate: Math.round(engagementRate * 100) / 100,
          hashtags:
            video.hashtags?.flatMap((hashtag) =>
              hashtag.name ? [hashtag.name] : [],
            ) || [],
          id: video.id,
          likes,
          mediaType: this.extractMediaType(video),
          mediaUrl: this.extractMediaUrl(video),
          publishedAt: new Date((video.createTime || 0) * 1000),
          shares,
          text: video.text || '',
          url: video.webVideoUrl,
          views,
        };
      });

      return { posts, profile };
    } catch (error) {
      this.logger.error(`${this.constructorName}: TikTok scrape failed`, {
        error,
        handle,
      });
      throw error;
    }
  }

  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#(\w+)/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map((tag) => tag.slice(1)) : [];
  }

  private extractMediaUrl(record: unknown): string | undefined {
    const candidate = this.extractString(
      record,
      'displayUrl',
      'displayUrlHD',
      'imageUrl',
      'image_url',
      'thumbnailUrl',
      'thumbnailUrlHD',
      'videoUrl',
      'video_url',
      'videoPlayUrl',
      'downloadUrl',
      'downloadAddr',
    );

    if (candidate) {
      return candidate;
    }

    const imageCandidates = this.extractStringArray(
      record,
      'images',
      'imageUrls',
    );
    if (imageCandidates.length > 0) {
      return imageCandidates[0];
    }

    const videoCandidates = this.extractStringArray(record, 'videoUrls');
    if (videoCandidates.length > 0) {
      return videoCandidates[0];
    }

    return undefined;
  }

  private extractMediaType(record: unknown): 'image' | 'video' | undefined {
    const explicitType = this.extractString(record, 'type', 'mediaType');
    if (explicitType?.toLowerCase().includes('video')) {
      return 'video';
    }
    if (explicitType?.toLowerCase().includes('image')) {
      return 'image';
    }

    const hasVideoUrl =
      this.extractString(
        record,
        'videoUrl',
        'video_url',
        'videoPlayUrl',
        'downloadUrl',
        'downloadAddr',
      ) !== undefined;

    if (hasVideoUrl || this.extractBoolean(record, 'isVideo')) {
      return 'video';
    }

    const hasImageUrl =
      this.extractString(
        record,
        'displayUrl',
        'displayUrlHD',
        'imageUrl',
        'image_url',
        'thumbnailUrl',
        'thumbnailUrlHD',
      ) !== undefined;

    if (
      hasImageUrl ||
      this.extractStringArray(record, 'images', 'imageUrls').length > 0
    ) {
      return 'image';
    }

    return undefined;
  }

  private extractString(
    record: unknown,
    ...keys: string[]
  ): string | undefined {
    if (!record || typeof record !== 'object') {
      return undefined;
    }

    const map = record as Record<string, unknown>;
    for (const key of keys) {
      const value = map[key];
      if (typeof value === 'string' && value !== '') {
        return value;
      }
    }

    return undefined;
  }

  private extractStringArray(record: unknown, ...keys: string[]): string[] {
    if (!record || typeof record !== 'object') {
      return [];
    }

    const map = record as Record<string, unknown>;
    for (const key of keys) {
      const value = map[key];
      if (Array.isArray(value)) {
        return value.filter(
          (item): item is string => typeof item === 'string' && item !== '',
        );
      }
    }

    return [];
  }

  private extractBoolean(record: unknown, key: string): boolean {
    if (!record || typeof record !== 'object') {
      return false;
    }

    return (record as Record<string, unknown>)[key] === true;
  }

  calculateAggregateMetrics(posts: ScrapedPost[]): {
    avgEngagementRate: number;
    avgViralScore: number;
    postFrequency: number;
    bestPostingTimes: string[];
    topHashtags: string[];
    avgLikes: number;
    avgComments: number;
    avgShares: number;
  } {
    if (posts.length === 0) {
      return {
        avgComments: 0,
        avgEngagementRate: 0,
        avgLikes: 0,
        avgShares: 0,
        avgViralScore: 0,
        bestPostingTimes: [],
        postFrequency: 0,
        topHashtags: [],
      };
    }

    const totals = posts.reduce(
      (acc, post) => {
        acc.likes += post.likes;
        acc.comments += post.comments;
        acc.shares += post.shares;
        acc.engagementRate += post.engagementRate;
        return acc;
      },
      { comments: 0, engagementRate: 0, likes: 0, shares: 0 },
    );

    const count = posts.length;

    // Calculate posting frequency (posts per week)
    const dates = posts.map((p) => p.publishedAt.getTime()).sort();
    const dateRange =
      (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24 * 7);
    const postFrequency = dateRange > 0 ? count / dateRange : count;

    // Find best posting times
    const hourCounts: Record<number, number> = {};
    for (const post of posts) {
      const hour = post.publishedAt.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const sortedHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => `${hour.padStart(2, '0')}:00`);

    // Find top hashtags
    const hashtagCounts: Record<string, number> = {};
    for (const post of posts) {
      for (const tag of post.hashtags) {
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      }
    }
    const topHashtags = Object.entries(hashtagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);

    // Calculate viral score based on engagement rate distribution
    const sortedEngagement = posts
      .map((p) => p.engagementRate)
      .sort((a, b) => b - a);
    const topPerformers = sortedEngagement.slice(0, Math.ceil(count * 0.1));
    const avgViralScore =
      topPerformers.reduce((a, b) => a + b, 0) / topPerformers.length || 0;

    return {
      avgComments: Math.round(totals.comments / count),
      avgEngagementRate:
        Math.round((totals.engagementRate / count) * 100) / 100,
      avgLikes: Math.round(totals.likes / count),
      avgShares: Math.round(totals.shares / count),
      avgViralScore: Math.round(avgViralScore * 100) / 100,
      bestPostingTimes: sortedHours,
      postFrequency: Math.round(postFrequency * 10) / 10,
      topHashtags,
    };
  }
}
