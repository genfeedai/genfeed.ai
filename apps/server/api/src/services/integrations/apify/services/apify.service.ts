import type {
  ApifyHashtagData,
  ApifyInstagramPost,
  ApifyLinkedInPost,
  ApifyNormalizedInstagramComment,
  ApifyNormalizedTikTokComment,
  ApifyNormalizedYouTubeComment,
  ApifyRedditPost,
  ApifySoundData,
  ApifyTikTokVideo,
  ApifyTrendData,
  ApifyVideoData,
  ApifyYouTubeVideo,
  TrendOptions,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { ApifyLinkedInService } from '@api/services/integrations/apify/services/modules/apify-linkedin.service';
import { ApifyPinterestService } from '@api/services/integrations/apify/services/modules/apify-pinterest.service';
import { ApifyRedditService } from '@api/services/integrations/apify/services/modules/apify-reddit.service';
import { ApifyTikTokService } from '@api/services/integrations/apify/services/modules/apify-tiktok.service';
import { ApifyTwitterService } from '@api/services/integrations/apify/services/modules/apify-twitter.service';
import { ApifyYouTubeService } from '@api/services/integrations/apify/services/modules/apify-youtube.service';
import type { SocialSourceResearchContext } from '@api/services/source-collector/source-collector.types';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const LEADING_HASH_PATTERN = /^#/;

/**
 * ApifyService
 *
 * Orchestrator that delegates to platform-specific sub-services.
 * Public methods follow the existing integration service contract.
 *
 * Sub-services:
 * - ApifyBaseService: Shared actor execution, metrics, helpers
 * - ApifyTikTokService: TikTok trends, videos, sounds, comments
 * - ApifyInstagramService: Instagram trends, videos, comments
 * - ApifyTwitterService: Twitter/X trends
 * - ApifyYouTubeService: YouTube trends, videos, comments
 * - ApifyRedditService: Reddit trends, videos, comments, posts
 * - ApifyPinterestService: Pinterest trends
 * - ApifyLinkedInService: LinkedIn public profile posts
 */
@Traced()
@Injectable()
export class ApifyService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly tiktokService: ApifyTikTokService,
    private readonly instagramService: ApifyInstagramService,
    private readonly twitterService: ApifyTwitterService,
    private readonly youtubeService: ApifyYouTubeService,
    private readonly redditService: ApifyRedditService,
    private readonly pinterestService: ApifyPinterestService,
    private readonly linkedinService: ApifyLinkedInService,
  ) {}

  /**
   * Run an Apify actor and wait for results
   */
  runActor<T>(actorId: string, input: object): Promise<T[]> {
    return this.baseService.runActor<T>(actorId, input);
  }

  getTikTokTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.tiktokService.getTikTokTrends(options);
  }

  getTikTokVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    return this.tiktokService.getTikTokVideos(limit);
  }

  getTikTokSounds(limit: number = 50): Promise<ApifySoundData[]> {
    return this.tiktokService.getTikTokSounds(limit);
  }

  getTikTokVideoComments(
    videoUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedTikTokComment[]> {
    return this.tiktokService.getTikTokVideoComments(videoUrl, options);
  }

  getTikTokUserVideos(
    username: string,
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyTikTokVideo[]> {
    return this.tiktokService.getTikTokUserVideos(
      username,
      options,
      researchContext,
    );
  }

  getTikTokVideoByUrl(
    videoUrl: string,
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyTikTokVideo> {
    return this.tiktokService.getTikTokVideoByUrl(videoUrl, researchContext);
  }

  searchTikTokByHashtag(
    hashtag: string,
    options?: { limit?: number },
  ): Promise<ApifyTikTokVideo[]> {
    return this.tiktokService.searchTikTokByHashtag(hashtag, options);
  }

  searchTikTokByQueries(
    queries: string[],
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyVideoData[]> {
    return this.tiktokService.searchTikTokByQueries(
      queries,
      options,
      researchContext,
    );
  }

  getInstagramTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.instagramService.getInstagramTrends(options);
  }

  getInstagramVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    return this.instagramService.getInstagramVideos(limit);
  }

  getInstagramPostComments(
    postUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedInstagramComment[]> {
    return this.instagramService.getInstagramPostComments(postUrl, options);
  }

  getInstagramUserPosts(
    username: string,
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyInstagramPost[]> {
    return this.instagramService.getInstagramUserPosts(
      username,
      options,
      researchContext,
    );
  }

  getInstagramPostByUrl(
    postUrl: string,
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyInstagramPost> {
    return this.instagramService.getInstagramPostByUrl(
      postUrl,
      researchContext,
    );
  }

  searchInstagramByHashtag(
    hashtag: string,
    options?: { limit?: number },
  ): Promise<ApifyInstagramPost[]> {
    return this.instagramService.searchInstagramByHashtag(hashtag, options);
  }

  getTwitterTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.twitterService.getTwitterTrends(options);
  }

  getYouTubeVideoComments(
    videoUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyNormalizedYouTubeComment[]> {
    return this.youtubeService.getYouTubeVideoComments(videoUrl, options);
  }

  getYouTubeChannelVideos(
    channelUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyYouTubeVideo[]> {
    return this.youtubeService.getYouTubeChannelVideos(channelUrl, options);
  }

  getYouTubeChannelUploads(
    channelUrl: string,
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyYouTubeVideo[]> {
    return this.youtubeService.getYouTubeChannelUploads(
      channelUrl,
      options,
      researchContext,
    );
  }

  searchYouTubeVideos(
    query: string,
    options?: { limit?: number },
  ): Promise<ApifyYouTubeVideo[]> {
    return this.youtubeService.searchYouTubeVideos(query, options);
  }

  getRedditTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.redditService.getRedditTrends(options);
  }

  getRedditVideos(limit: number = 50): Promise<ApifyVideoData[]> {
    return this.redditService.getRedditVideos(limit);
  }

  getRedditPostComments(
    postUrl: string,
    options?: { limit?: number },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.getRedditPostComments(postUrl, options);
  }

  getSubredditPosts(
    subreddit: string,
    options?: { limit?: number; sort?: 'hot' | 'new' | 'top' },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.getSubredditPosts(subreddit, options);
  }

  getRedditUserPosts(
    username: string,
    options?: { limit?: number },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.getRedditUserPosts(username, options);
  }

  searchRedditPosts(
    query: string,
    options?: { limit?: number; subreddit?: string },
  ): Promise<ApifyRedditPost[]> {
    return this.redditService.searchRedditPosts(query, options);
  }

  getLinkedInProfilePosts(
    profileUrl: string,
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyLinkedInPost[]> {
    return this.linkedinService.getLinkedInProfilePosts(
      profileUrl,
      options,
      researchContext,
    );
  }

  getPinterestTrends(options?: TrendOptions): Promise<ApifyTrendData[]> {
    return this.pinterestService.getPinterestTrends(options);
  }

  /**
   * Get trending hashtags from a specific platform
   */
  async getTrendingHashtags(
    platform: string,
    limit: number = 50,
  ): Promise<ApifyHashtagData[]> {
    const trendFetchers: Record<
      string,
      (options: TrendOptions) => Promise<ApifyTrendData[]>
    > = {
      instagram: (options) => this.getInstagramTrends(options),
      tiktok: (options) => this.getTikTokTrends(options),
      twitter: (options) => this.getTwitterTrends(options),
    };

    const fetcher = trendFetchers[platform];
    if (!fetcher) {
      return [];
    }

    try {
      const trends = await fetcher({ limit });

      return trends
        .filter((t) => t.metadata.trendType === 'hashtag')
        .map((t) => ({
          growthRate: t.growthRate,
          hashtag: t.topic.replace(LEADING_HASH_PATTERN, ''),
          platform: t.platform,
          postCount: t.mentions,
          postCountScope: t.platform === 'instagram' ? 'observed' : 'platform',
          growthMeasured: false,
          relatedHashtags: (t.metadata.hashtags as string[]) || [],
          viewCount: (t.metadata.viewCount as number) || 0,
          viralityScore: t.viralityScore,
        }));
    } catch (error: unknown) {
      this.baseService.logFailure(
        `${this.constructorName}.getTrendingHashtags failed for ${platform}`,
        error,
      );
      throw error;
    }
  }
}
