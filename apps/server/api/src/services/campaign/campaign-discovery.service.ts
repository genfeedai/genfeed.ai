/**
 * Campaign Discovery Service
 *
 * AI-powered content discovery for marketing campaigns.
 * Leverages SocialMonitorService to find relevant content based on:
 * - Keywords
 * - Hashtags
 * - Subreddits
 * - Engagement filters
 * - Relevance scoring
 */
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import {
  CampaignDiscoveryConfig,
  type OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import {
  type SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignTargetType,
  ReplyBotPlatform,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

export interface DiscoveredTarget {
  platform: CampaignPlatform;
  targetType: CampaignTargetType;
  externalId: string;
  contentUrl: string;
  authorUsername: string;
  authorId?: string;
  contentText: string;
  contentCreatedAt: Date;
  likes: number;
  retweets: number;
  replies: number;
  discoverySource: CampaignDiscoverySource;
  relevanceScore: number;
  matchedKeyword?: string;
}

@Injectable()
export class CampaignDiscoveryService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly socialMonitorService: SocialMonitorService,
    private readonly campaignTargetsService: CampaignTargetsService,
  ) {}

  /**
   * Discover targets for a campaign based on its discovery configuration
   */
  async discoverTargets(
    campaign: OutreachCampaignDocument,
    limit: number = 50,
  ): Promise<DiscoveredTarget[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const config = campaign.discoveryConfig;

    if (!config) {
      return [];
    }

    try {
      const allTargets: DiscoveredTarget[] = [];

      // Search by keywords
      if (config.keywords && config.keywords.length > 0) {
        const keywordTargets = await this.searchByKeywords(
          campaign.platform,
          config.keywords,
          config,
          Math.ceil(limit / config.keywords.length),
        );
        allTargets.push(...keywordTargets);
      }

      // Search by hashtags
      if (config.hashtags && config.hashtags.length > 0) {
        const hashtagTargets = await this.searchByHashtags(
          campaign.platform,
          config.hashtags,
          config,
          Math.ceil(limit / config.hashtags.length),
        );
        allTargets.push(...hashtagTargets);
      }

      // Search by subreddits (Reddit only)
      if (
        campaign.platform === CampaignPlatform.REDDIT &&
        config.subreddits &&
        config.subreddits.length > 0
      ) {
        const subredditTargets = await this.searchBySubreddits(
          config.subreddits,
          config,
          Math.ceil(limit / config.subreddits.length),
        );
        allTargets.push(...subredditTargets);
      }

      // Filter out duplicates by externalId
      const uniqueTargets = this.deduplicateTargets(allTargets);

      // Filter out already existing targets
      const newTargets = await this.filterExistingTargets(
        campaign._id.toString(),
        uniqueTargets,
      );

      // Sort by relevance score
      newTargets.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Limit results
      const finalTargets = newTargets.slice(0, limit);

      this.loggerService.log(`${url} success`, {
        campaignId: campaign._id,
        discoveredCount: finalTargets.length,
      });

      return finalTargets;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        campaignId: campaign._id,
        error,
      });
      throw error;
    }
  }

  /**
   * Generic search helper that handles the common pattern for all search types
   */
  private async searchByTerms(
    terms: string[],
    platform: CampaignPlatform,
    replyBotPlatform: ReplyBotPlatform,
    discoverySource: CampaignDiscoverySource,
    config: CampaignDiscoveryConfig,
    limitPerTerm: number,
    formatQuery: (term: string) => string = (term) => term,
  ): Promise<DiscoveredTarget[]> {
    const targets: DiscoveredTarget[] = [];

    for (const term of terms) {
      const query = formatQuery(term);
      const content = await this.socialMonitorService.searchContent(
        replyBotPlatform,
        query,
        { limit: limitPerTerm },
      );

      const filtered = this.filterContent(content, config);
      const mapped = this.mapContentToTargets(
        filtered,
        platform,
        discoverySource,
        term,
        config,
      );

      targets.push(...mapped);
    }

    return targets;
  }

  /**
   * Search content by keywords
   */
  private searchByKeywords(
    platform: CampaignPlatform,
    keywords: string[],
    config: CampaignDiscoveryConfig,
    limitPerKeyword: number,
  ): Promise<DiscoveredTarget[]> {
    return this.searchByTerms(
      keywords,
      platform,
      this.mapPlatform(platform),
      CampaignDiscoverySource.KEYWORD_SEARCH,
      config,
      limitPerKeyword,
    );
  }

  /**
   * Search content by hashtags
   */
  private searchByHashtags(
    platform: CampaignPlatform,
    hashtags: string[],
    config: CampaignDiscoveryConfig,
    limitPerHashtag: number,
  ): Promise<DiscoveredTarget[]> {
    return this.searchByTerms(
      hashtags,
      platform,
      this.mapPlatform(platform),
      CampaignDiscoverySource.HASHTAG,
      config,
      limitPerHashtag,
      (hashtag) => (hashtag.startsWith('#') ? hashtag : `#${hashtag}`),
    );
  }

  /**
   * Search content by subreddits
   */
  private searchBySubreddits(
    subreddits: string[],
    config: CampaignDiscoveryConfig,
    limitPerSubreddit: number,
  ): Promise<DiscoveredTarget[]> {
    return this.searchByTerms(
      subreddits,
      CampaignPlatform.REDDIT,
      ReplyBotPlatform.REDDIT,
      CampaignDiscoverySource.SUBREDDIT,
      config,
      limitPerSubreddit,
      (subreddit) =>
        subreddit.startsWith('r/') ? subreddit : `r/${subreddit}`,
    );
  }

  /**
   * Filter content based on discovery configuration
   */
  private filterContent(
    content: SocialContentData[],
    config: CampaignDiscoveryConfig,
  ): SocialContentData[] {
    const now = new Date();
    const maxAge = config.maxAgeHours * 60 * 60 * 1000;

    return content.filter((item) => {
      // Filter by age
      const age = now.getTime() - item.createdAt.getTime();
      if (age > maxAge) {
        return false;
      }

      // Filter by engagement
      const engagement =
        (item.metrics?.likes || 0) + (item.metrics?.shares || 0);
      if (engagement < config.minEngagement) {
        return false;
      }
      if (engagement > config.maxEngagement) {
        return false;
      }

      // Filter by excluded authors
      if (config.excludeAuthors && config.excludeAuthors.length > 0) {
        if (
          config.excludeAuthors
            .map((a: string) => a.toLowerCase())
            .includes(item.authorUsername.toLowerCase())
        ) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Map social content to discovered targets
   */
  private mapContentToTargets(
    content: SocialContentData[],
    platform: CampaignPlatform,
    discoverySource: CampaignDiscoverySource,
    matchedKeyword: string,
    config: CampaignDiscoveryConfig,
  ): DiscoveredTarget[] {
    return content.map((item) => {
      const relevanceScore = this.calculateRelevanceScore(item, config);

      return {
        authorId: item.authorId,
        authorUsername: item.authorUsername,
        contentCreatedAt: item.createdAt,
        contentText: item.text,
        contentUrl: item.contentUrl || '',
        discoverySource,
        externalId: item.id,
        likes: item.metrics?.likes || 0,
        matchedKeyword,
        platform,
        relevanceScore,
        replies: item.metrics?.comments || 0,
        retweets: item.metrics?.shares || 0,
        targetType: this.mapContentType(item, platform),
      };
    });
  }

  /**
   * Calculate relevance score for content
   */
  private calculateRelevanceScore(
    item: SocialContentData,
    _config: CampaignDiscoveryConfig,
  ): number {
    let score = 0.5; // Base score

    // Boost for engagement
    const engagement = (item.metrics?.likes || 0) + (item.metrics?.shares || 0);
    if (engagement > 100) {
      score += 0.1;
    }
    if (engagement > 500) {
      score += 0.1;
    }

    // Boost for recency
    const age = Date.now() - item.createdAt.getTime();
    const hoursOld = age / (60 * 60 * 1000);
    if (hoursOld < 1) {
      score += 0.2;
    } else if (hoursOld < 6) {
      score += 0.1;
    }

    // Penalty for low engagement
    if (engagement < 10) {
      score -= 0.1;
    }

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Map platform to ReplyBotPlatform
   */
  private mapPlatform(platform: CampaignPlatform): ReplyBotPlatform {
    switch (platform) {
      case CampaignPlatform.TWITTER:
        return ReplyBotPlatform.TWITTER;
      case CampaignPlatform.REDDIT:
        return ReplyBotPlatform.REDDIT;
      default:
        return ReplyBotPlatform.TWITTER;
    }
  }

  /**
   * Map content type to CampaignTargetType
   */
  private mapContentType(
    _item: SocialContentData,
    platform: CampaignPlatform,
  ): CampaignTargetType {
    if (platform === CampaignPlatform.REDDIT) {
      return CampaignTargetType.REDDIT_POST;
    }
    return CampaignTargetType.TWEET;
  }

  /**
   * Deduplicate targets by external ID
   */
  private deduplicateTargets(targets: DiscoveredTarget[]): DiscoveredTarget[] {
    const seen = new Set<string>();
    return targets.filter((target) => {
      if (seen.has(target.externalId)) {
        return false;
      }
      seen.add(target.externalId);
      return true;
    });
  }

  /**
   * Filter out targets that already exist in the campaign
   */
  private async filterExistingTargets(
    campaignId: string,
    targets: DiscoveredTarget[],
  ): Promise<DiscoveredTarget[]> {
    const newTargets: DiscoveredTarget[] = [];

    for (const target of targets) {
      const exists = await this.campaignTargetsService.targetExists(
        campaignId,
        target.externalId,
      );
      if (!exists) {
        newTargets.push(target);
      }
    }

    return newTargets;
  }

  /**
   * Add discovered targets to campaign
   */
  async addDiscoveredTargetsToCampaign(
    campaign: OutreachCampaignDocument,
    targets: DiscoveredTarget[],
  ): Promise<number> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const targetsToCreate = targets.map((target) => ({
        authorId: target.authorId,
        authorUsername: target.authorUsername,
        campaign: campaign._id.toString(),
        contentCreatedAt: target.contentCreatedAt,
        contentText: target.contentText,
        contentUrl: target.contentUrl,
        discoverySource: target.discoverySource,
        externalId: target.externalId,
        likes: target.likes,
        matchedKeyword: target.matchedKeyword,
        organization: campaign.organization,
        platform: target.platform,
        relevanceScore: target.relevanceScore,
        replies: target.replies,
        retweets: target.retweets,
        targetType: target.targetType,
      }));

      const created =
        await this.campaignTargetsService.createMany(targetsToCreate);

      this.loggerService.log(`${url} success`, {
        addedCount: created.length,
        campaignId: campaign._id,
      });

      return created.length;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        campaignId: campaign._id,
        error,
      });
      throw error;
    }
  }
}
