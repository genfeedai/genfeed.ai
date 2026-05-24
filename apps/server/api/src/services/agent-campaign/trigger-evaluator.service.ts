import { type AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { type AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import {
  type AnalyticsBestPostingTime,
  AnalyticsService,
} from '@api/endpoints/analytics/analytics.service';
import {
  ContentEngineService,
  type TriggerDispatchType,
} from '@api/services/agent-campaign/content-engine.service';
import {
  MAX_TRIGGER_DISPATCHES_PER_TYPE,
  PERFORMANCE_DIP_MIN_ENGAGEMENT_GROWTH,
  TREND_SPIKE_MIN_GROWTH_RATE,
  TREND_SPIKE_MIN_VIRALITY_SCORE,
  VIRAL_POST_MIN_ENGAGEMENT_RATE,
} from '@api/services/agent-campaign/orchestrator.constants';
import { isOrchestratorAgentType } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { AnalyticsMetric } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

type AnalyticsOverviewSnapshot = {
  avgEngagementRate: number;
  growth?: {
    engagement?: number;
    posts?: number;
    views?: number;
  };
  totalEngagement?: number;
  totalPosts: number;
  totalViews: number;
};

type TopContentEntry = {
  description?: string;
  engagementRate?: number;
  isVideo?: boolean;
  label?: string;
  platform?: string;
  totalViews?: number;
};

type TriggerCandidate = {
  contextLines: string[];
  metadata: Record<string, string | number | boolean | null>;
  score: number;
  summary: string;
  type: TriggerDispatchType;
};

type TriggerDispatchGroup = TriggerCandidate & {
  strategies: AgentStrategyDocument[];
};

export type TriggerEvaluationResult = {
  campaignId: string;
  dispatchCount: number;
  dispatchedTriggerTypes: TriggerDispatchType[];
  skippedReason?: string;
  summary: string;
};

@Injectable()
export class TriggerEvaluatorService {
  private readonly logContext = 'TriggerEvaluatorService';

  constructor(
    private readonly agentCampaignsService: AgentCampaignsService,
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly analyticsService: AnalyticsService,
    private readonly brandsService: BrandsService,
    private readonly trendsService: TrendsService,
    private readonly contentEngineService: ContentEngineService,
    private readonly logger: LoggerService,
  ) {}

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  async evaluateCampaign(
    campaignId: string,
    organizationId: string,
  ): Promise<TriggerEvaluationResult> {
    const campaign = await this.agentCampaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (!campaign) {
      throw new NotFoundException(
        `Campaign ${campaignId} not found in organization ${organizationId}`,
      );
    }

    if (campaign.status !== 'active') {
      return this.buildSkippedResult(
        campaignId,
        `Campaign is ${campaign.status}, skipping trigger evaluation.`,
      );
    }

    const strategies = await this.loadEligibleStrategies(
      campaign,
      organizationId,
    );
    if (strategies.length === 0) {
      return this.buildSkippedResult(
        campaignId,
        'No campaign strategies have trigger watchers enabled.',
      );
    }

    const [
      analyticsOverview,
      bestPostingTimes,
      brandDescription,
      topContent,
      trends,
    ] = await Promise.all([
      this.loadAnalyticsOverview(campaign),
      this.loadBestPostingTimes(campaign),
      this.loadBrandDescription(campaign),
      this.loadTopContent(campaign),
      this.loadCurrentTrends(campaign),
    ]);

    await this.persistPostingRecommendations(
      strategies,
      organizationId,
      bestPostingTimes,
    );

    const dispatchGroups = this.buildDispatchGroups({
      analyticsOverview,
      bestPostingTimes,
      brandDescription,
      campaign,
      strategies,
      topContent,
      trends,
    });

    if (dispatchGroups.length === 0) {
      return this.buildSkippedResult(
        campaignId,
        'No trigger thresholds were met for the current evaluation window.',
      );
    }

    let dispatchCount = 0;
    const dispatchedTriggerTypes: TriggerDispatchType[] = [];

    for (const dispatchGroup of dispatchGroups) {
      const result = await this.contentEngineService.dispatchTriggeredRuns({
        campaignId,
        contentMixSummary: this.buildContentMixSummary(
          dispatchGroup.strategies[0],
          topContent,
        ),
        organizationId,
        postingRecommendations: bestPostingTimes,
        strategies: dispatchGroup.strategies,
        triggerContextLines: dispatchGroup.contextLines,
        triggerMetadata: dispatchGroup.metadata,
        triggerSummary: dispatchGroup.summary,
        triggerType: dispatchGroup.type,
      });

      if (result.dispatchCount > 0) {
        dispatchCount += result.dispatchCount;
        dispatchedTriggerTypes.push(dispatchGroup.type);
      }
    }

    const summary =
      dispatchCount > 0
        ? `Trigger evaluation dispatched ${dispatchCount} run(s) across ${dispatchedTriggerTypes.join(', ')}.`
        : 'Trigger evaluation completed without any dispatches.';

    this.logger.log(`${this.logContext} completed`, {
      campaignId,
      dispatchCount,
      dispatchedTriggerTypes,
    });

    return {
      campaignId,
      dispatchCount,
      dispatchedTriggerTypes,
      summary,
    };
  }

  private buildSkippedResult(
    campaignId: string,
    skippedReason: string,
  ): TriggerEvaluationResult {
    this.logger.log(`${this.logContext} skipped`, {
      campaignId,
      skippedReason,
    });

    return {
      campaignId,
      dispatchCount: 0,
      dispatchedTriggerTypes: [],
      skippedReason,
      summary: skippedReason,
    };
  }

  private async loadEligibleStrategies(
    campaign: AgentCampaignDocument,
    organizationId: string,
  ): Promise<AgentStrategyDocument[]> {
    const strategyIds = [
      ...new Set(campaign.agents.map((agentId) => String(agentId))),
    ];
    const strategies = await Promise.all(
      strategyIds.map((strategyId) =>
        this.agentStrategiesService.findOneById(strategyId, organizationId),
      ),
    );

    return strategies
      .filter(
        (strategy): strategy is AgentStrategyDocument => strategy !== null,
      )
      .filter((strategy) => strategy.isActive !== false)
      .filter((strategy) => strategy.isEnabled !== false)
      .filter((strategy) => !isOrchestratorAgentType(strategy.agentType))
      .filter(
        (strategy) =>
          strategy.opportunitySources?.eventTriggersEnabled === true ||
          strategy.opportunitySources?.trendWatchersEnabled === true,
      );
  }

  private async loadAnalyticsOverview(
    campaign: AgentCampaignDocument,
  ): Promise<AnalyticsOverviewSnapshot> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    return (await this.analyticsService.getOverview(
      sevenDaysAgo.toISOString(),
      now.toISOString(),
      campaign.brand ? String(campaign.brand) : undefined,
      String(campaign.organization),
    )) as AnalyticsOverviewSnapshot;
  }

  private async loadBestPostingTimes(
    campaign: AgentCampaignDocument,
  ): Promise<AnalyticsBestPostingTime[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);

    return await this.analyticsService.getBestPostingTimes(
      thirtyDaysAgo.toISOString(),
      now.toISOString(),
      campaign.brand ? String(campaign.brand) : undefined,
      String(campaign.organization),
    );
  }

  private async loadTopContent(
    campaign: AgentCampaignDocument,
  ): Promise<TopContentEntry[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    return (await this.analyticsService.getTopContent(
      sevenDaysAgo.toISOString(),
      now.toISOString(),
      5,
      AnalyticsMetric.ENGAGEMENT,
      campaign.brand ? String(campaign.brand) : undefined,
      undefined,
      String(campaign.organization),
    )) as TopContentEntry[];
  }

  private async loadCurrentTrends(campaign: AgentCampaignDocument): Promise<
    Array<{
      growthRate: number;
      mentions: number;
      metadata?: {
        creatorHandle?: string;
        hashtags?: string[];
        sampleContent?: string;
      };
      platform: string;
      topic: string;
      viralityScore: number;
    }>
  > {
    try {
      return await this.trendsService.getTrends(
        String(campaign.organization),
        campaign.brand ? String(campaign.brand) : undefined,
        undefined,
        {
          allowFetchIfMissing: false,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(`${this.logContext} trends unavailable`, {
        campaignId: String(campaign._id),
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async loadBrandDescription(
    campaign: AgentCampaignDocument,
  ): Promise<string> {
    if (!campaign.brand) {
      return '';
    }

    const brand = await this.brandsService.findOne({
      _id: campaign.brand,
      isDeleted: false,
      organization: campaign.organization,
    });

    if (!brand) {
      return '';
    }

    return [brand.label, brand.description, brand.text]
      .filter((value): value is string => Boolean(value))
      .join(' ');
  }

  private async persistPostingRecommendations(
    strategies: AgentStrategyDocument[],
    organizationId: string,
    bestPostingTimes: AnalyticsBestPostingTime[],
  ): Promise<void> {
    await Promise.all(
      strategies.map(async (strategy) => {
        const platforms = strategy.platforms ?? [];
        const preferredTimes = bestPostingTimes
          .filter((recommendation) =>
            platforms.length > 0
              ? platforms.includes(recommendation.platform)
              : true,
          )
          .map(
            (recommendation) =>
              `${String(recommendation.hour).padStart(2, '0')}:00`,
          )
          .slice(0, 3);

        if (preferredTimes.length === 0) {
          return;
        }

        await this.agentStrategiesService.patch(String(strategy._id), {
          preferredPostingTimes: preferredTimes,
        });

        this.logger.debug(`${this.logContext} stored posting recommendations`, {
          organizationId,
          preferredTimes,
          strategyId: String(strategy._id),
        });
      }),
    );
  }

  private buildDispatchGroups(input: {
    analyticsOverview: AnalyticsOverviewSnapshot;
    bestPostingTimes: AnalyticsBestPostingTime[];
    brandDescription: string;
    campaign: AgentCampaignDocument;
    strategies: AgentStrategyDocument[];
    topContent: TopContentEntry[];
    trends: Array<{
      growthRate: number;
      mentions: number;
      metadata?: {
        creatorHandle?: string;
        hashtags?: string[];
        sampleContent?: string;
      };
      platform: string;
      topic: string;
      viralityScore: number;
    }>;
  }): TriggerDispatchGroup[] {
    const dispatchGroups: TriggerDispatchGroup[] = [];
    const claimedStrategyIds = new Set<string>();

    const trendSpikeCandidate = this.buildTrendSpikeCandidate(input);
    if (trendSpikeCandidate) {
      const strategies = this.selectStrategiesForTrigger(
        input.strategies,
        'trend_spike',
        claimedStrategyIds,
      );
      if (strategies.length > 0) {
        strategies.forEach((strategy) =>
          claimedStrategyIds.add(String(strategy._id)),
        );
        dispatchGroups.push({ ...trendSpikeCandidate, strategies });
      }
    }

    const viralPostCandidate = this.buildViralPostCandidate(input.topContent);
    if (viralPostCandidate) {
      const strategies = this.selectStrategiesForTrigger(
        input.strategies,
        'viral_post',
        claimedStrategyIds,
      );
      if (strategies.length > 0) {
        strategies.forEach((strategy) =>
          claimedStrategyIds.add(String(strategy._id)),
        );
        dispatchGroups.push({ ...viralPostCandidate, strategies });
      }
    }

    const performanceDipCandidate = this.buildPerformanceDipCandidate(
      input.analyticsOverview,
    );
    if (performanceDipCandidate) {
      const strategies = this.selectStrategiesForTrigger(
        input.strategies,
        'performance_dip',
        claimedStrategyIds,
      );
      if (strategies.length > 0) {
        dispatchGroups.push({ ...performanceDipCandidate, strategies });
      }
    }

    return dispatchGroups;
  }

  private buildTrendSpikeCandidate(input: {
    brandDescription: string;
    campaign: AgentCampaignDocument;
    strategies: AgentStrategyDocument[];
    trends: Array<{
      growthRate: number;
      mentions: number;
      metadata?: {
        creatorHandle?: string;
        hashtags?: string[];
        sampleContent?: string;
      };
      platform: string;
      topic: string;
      viralityScore: number;
    }>;
  }): TriggerCandidate | null {
    const keywordSet = this.buildKeywordSet(
      input.brandDescription,
      input.campaign.brief || '',
      this.readString(input.campaign.label) ?? '',
      ...input.strategies.flatMap((strategy) => strategy.topics ?? []),
    );

    let bestCandidate: TriggerCandidate | null = null;

    for (const trend of input.trends) {
      if (
        trend.viralityScore < TREND_SPIKE_MIN_VIRALITY_SCORE ||
        trend.growthRate < TREND_SPIKE_MIN_GROWTH_RATE
      ) {
        continue;
      }

      const searchableText = [
        trend.topic,
        trend.metadata?.sampleContent || '',
        ...(trend.metadata?.hashtags || []),
      ].join(' ');
      const searchableTokens = this.tokenize(searchableText);
      const overlapCount = searchableTokens.filter((token) =>
        keywordSet.has(token),
      ).length;

      if (keywordSet.size > 0 && overlapCount === 0) {
        continue;
      }

      const score =
        trend.viralityScore +
        trend.growthRate +
        overlapCount * 15 +
        trend.mentions;
      const summary = `Trend spike detected for "${trend.topic}" on ${trend.platform} with virality ${trend.viralityScore} and growth ${trend.growthRate.toFixed(1)}%.`;
      const candidate: TriggerCandidate = {
        contextLines: [
          `Trend topic: ${trend.topic}`,
          `Platform: ${trend.platform}`,
          `Virality score: ${trend.viralityScore}`,
          `Growth rate: ${trend.growthRate.toFixed(1)}%`,
          `Mentions: ${trend.mentions}`,
          trend.metadata?.creatorHandle
            ? `Creator signal: ${trend.metadata.creatorHandle}`
            : '',
          trend.metadata?.sampleContent
            ? `Sample content: ${trend.metadata.sampleContent}`
            : '',
        ].filter(Boolean),
        metadata: {
          creatorHandle: trend.metadata?.creatorHandle || null,
          growthRate: Number(trend.growthRate.toFixed(2)),
          mentions: trend.mentions,
          platform: trend.platform,
          topic: trend.topic,
          viralityScore: trend.viralityScore,
        },
        score,
        summary,
        type: 'trend_spike',
      };

      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  private buildViralPostCandidate(
    topContent: TopContentEntry[],
  ): TriggerCandidate | null {
    const topPerformer = topContent
      .filter(
        (entry) =>
          typeof entry.engagementRate === 'number' &&
          entry.engagementRate >= VIRAL_POST_MIN_ENGAGEMENT_RATE,
      )
      .sort(
        (left, right) =>
          (right.engagementRate || 0) - (left.engagementRate || 0),
      )[0];

    if (!topPerformer || typeof topPerformer.engagementRate !== 'number') {
      return null;
    }

    return {
      contextLines: [
        `Top content: ${topPerformer.label || 'Untitled post'}`,
        `Platform: ${topPerformer.platform || 'unknown'}`,
        `Engagement rate: ${topPerformer.engagementRate.toFixed(2)}%`,
        `Views: ${Math.round(topPerformer.totalViews || 0)}`,
        topPerformer.description
          ? `Description: ${topPerformer.description}`
          : '',
      ].filter(Boolean),
      metadata: {
        engagementRate: Number(topPerformer.engagementRate.toFixed(2)),
        isVideo: topPerformer.isVideo === true,
        label: topPerformer.label || 'Untitled post',
        platform: topPerformer.platform || 'unknown',
        totalViews: Math.round(topPerformer.totalViews || 0),
      },
      score:
        Math.round(topPerformer.engagementRate * 10) +
        Math.round(topPerformer.totalViews || 0),
      summary: `Viral post signal detected for "${topPerformer.label || 'Untitled post'}" on ${topPerformer.platform || 'unknown'} at ${topPerformer.engagementRate.toFixed(2)}% engagement.`,
      type: 'viral_post',
    };
  }

  private buildPerformanceDipCandidate(
    analyticsOverview: AnalyticsOverviewSnapshot,
  ): TriggerCandidate | null {
    const engagementGrowth = analyticsOverview.growth?.engagement ?? 0;
    if (
      analyticsOverview.totalPosts <= 0 ||
      engagementGrowth > PERFORMANCE_DIP_MIN_ENGAGEMENT_GROWTH
    ) {
      return null;
    }

    return {
      contextLines: [
        `Average engagement rate: ${analyticsOverview.avgEngagementRate.toFixed(2)}%`,
        `7-day engagement growth: ${engagementGrowth.toFixed(2)}%`,
        `Tracked posts: ${analyticsOverview.totalPosts}`,
        `Total views: ${analyticsOverview.totalViews}`,
      ],
      metadata: {
        avgEngagementRate: Number(
          analyticsOverview.avgEngagementRate.toFixed(2),
        ),
        engagementGrowth: Number(engagementGrowth.toFixed(2)),
        totalPosts: analyticsOverview.totalPosts,
        totalViews: analyticsOverview.totalViews,
      },
      score: Math.abs(Math.round(engagementGrowth)),
      summary: `Performance dip detected: engagement is down ${Math.abs(engagementGrowth).toFixed(2)}% over the current 7-day window.`,
      type: 'performance_dip',
    };
  }

  private selectStrategiesForTrigger(
    strategies: AgentStrategyDocument[],
    triggerType: TriggerDispatchType,
    claimedStrategyIds: Set<string>,
  ): AgentStrategyDocument[] {
    const eligibleStrategies = strategies
      .filter((strategy) => !claimedStrategyIds.has(String(strategy._id)))
      .filter((strategy) => {
        if (triggerType === 'trend_spike') {
          return strategy.opportunitySources?.trendWatchersEnabled === true;
        }

        return strategy.opportunitySources?.eventTriggersEnabled === true;
      })
      .sort((left, right) => {
        const leftLabel = this.readString(left.label) ?? '';
        const rightLabel = this.readString(right.label) ?? '';

        if (triggerType !== 'viral_post') {
          return leftLabel.localeCompare(rightLabel);
        }

        if (left.engagementEnabled === right.engagementEnabled) {
          return leftLabel.localeCompare(rightLabel);
        }

        return left.engagementEnabled ? -1 : 1;
      });

    return eligibleStrategies.slice(0, MAX_TRIGGER_DISPATCHES_PER_TYPE);
  }

  private buildKeywordSet(...inputs: string[]): Set<string> {
    return new Set(inputs.flatMap((value) => this.tokenize(value)));
  }

  private tokenize(value: string): string[] {
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);
  }

  private buildContentMixSummary(
    strategy: AgentStrategyDocument,
    topContent: TopContentEntry[],
  ): string | null {
    if (!strategy.contentMix || topContent.length === 0) {
      return null;
    }

    const videoCount = topContent.filter(
      (entry) => entry.isVideo === true,
    ).length;
    const actualVideoPercent = Math.round(
      (videoCount / topContent.length) * 100,
    );
    const plannedVideoPercent =
      this.readNumber(strategy.contentMix.videoPercent) ?? 0;
    const plannedStaticPercent =
      (this.readNumber(strategy.contentMix.imagePercent) ?? 0) +
      (this.readNumber(strategy.contentMix.carouselPercent) ?? 0);
    const actualStaticPercent = 100 - actualVideoPercent;

    if (Math.abs(plannedVideoPercent - actualVideoPercent) < 15) {
      return `Recent media mix is roughly aligned with strategy: target ${plannedVideoPercent}% video / ${plannedStaticPercent}% static, recent ${actualVideoPercent}% video / ${actualStaticPercent}% static.`;
    }

    const direction =
      plannedVideoPercent > actualVideoPercent ? 'increase' : 'reduce';

    return `Media mix drift detected: target ${plannedVideoPercent}% video / ${plannedStaticPercent}% static, recent ${actualVideoPercent}% video / ${actualStaticPercent}% static. ${direction === 'increase' ? 'Increase' : 'Reduce'} video share in the next dispatch.`;
  }
}
