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
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  type ContentEngineCycleResult,
  type TriggerDispatchType,
  type TriggeredCampaignDispatchInput,
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
import { Injectable } from '@nestjs/common';

/**
 * Ids resolved once from the campaign's scalar FKs so that none of the five
 * loaders below re-reads a Mongo-era relation alias. `campaign.brand` /
 * `campaign.organization` are `undefined` on an unpopulated read and a relation
 * object on a populated one, and every loader here feeds them straight into an
 * analytics or Prisma scope.
 */
type CampaignAnalyticsScope = {
  brandId?: string;
  campaignId: string;
  organizationId: string;
};

export type AnalyticsOverviewSnapshot = {
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

export type TopContentEntry = {
  description?: string;
  engagementRate?: number;
  isVideo?: boolean;
  label?: string;
  platform?: string;
  totalViews?: number;
};

export type TriggerTrendEntry = {
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
};

type TriggerCandidate = {
  contextLines: string[];
  metadata: Record<string, string | number | boolean | null>;
  score: number;
  summary: string;
  type: TriggerDispatchType;
};

export type TriggerDispatchGroup = TriggerCandidate & {
  strategies: AgentStrategyDocument[];
};

export type TriggerEvaluationState = {
  analyticsOverview: AnalyticsOverviewSnapshot;
  bestPostingTimes: AnalyticsBestPostingTime[];
  brandDescription: string;
  campaign: AgentCampaignDocument;
  campaignId: string;
  dispatchGroups?: TriggerDispatchGroup[];
  items?: TriggeredCampaignDispatchInput[];
  organizationId: string;
  skippedReason?: string;
  strategies: AgentStrategyDocument[];
  topContent: TopContentEntry[];
  trends: TriggerTrendEntry[];
};

export type PostingRecommendationItem = {
  organizationId: string;
  preferredPostingTimes: string[];
  strategyId: string;
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

  async loadEvaluationContext(
    campaignId: string,
    organizationId: string,
  ): Promise<TriggerEvaluationState> {
    const campaign = await this.agentCampaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (!campaign) {
      throw new NotFoundException('Campaign', campaignId);
    }

    if (campaign.status !== 'active') {
      return {
        analyticsOverview: {
          avgEngagementRate: 0,
          totalPosts: 0,
          totalViews: 0,
        },
        bestPostingTimes: [],
        brandDescription: '',
        campaign,
        campaignId,
        organizationId,
        skippedReason: `Campaign is ${campaign.status}, skipping trigger evaluation.`,
        strategies: [],
        topContent: [],
        trends: [],
      };
    }

    const strategies = await this.loadEligibleStrategies(
      campaign,
      organizationId,
    );
    if (strategies.length === 0) {
      return {
        analyticsOverview: {
          avgEngagementRate: 0,
          totalPosts: 0,
          totalViews: 0,
        },
        bestPostingTimes: [],
        brandDescription: '',
        campaign,
        campaignId,
        organizationId,
        skippedReason: 'No campaign strategies have trigger watchers enabled.',
        strategies: [],
        topContent: [],
        trends: [],
      };
    }

    const scope: CampaignAnalyticsScope = {
      brandId: campaign.brandId ?? undefined,
      campaignId,
      // The campaign was read scoped to this id, so it is authoritative.
      organizationId,
    };

    const [
      analyticsOverview,
      bestPostingTimes,
      brandDescription,
      topContent,
      trends,
    ] = await Promise.all([
      this.loadAnalyticsOverview(scope),
      this.loadBestPostingTimes(scope),
      this.loadBrandDescription(scope),
      this.loadTopContent(scope),
      this.loadCurrentTrends(scope),
    ]);

    return {
      analyticsOverview,
      bestPostingTimes,
      brandDescription,
      campaign,
      campaignId,
      organizationId,
      strategies,
      topContent,
      trends,
    };
  }

  planPostingRecommendations(state: TriggerEvaluationState): Omit<
    TriggerEvaluationState,
    'items'
  > & {
    items: PostingRecommendationItem[];
  } {
    if (state.skippedReason) return { ...state, items: [] };
    const items = state.strategies.flatMap((strategy) => {
      const platforms = strategy.platforms ?? [];
      const preferredPostingTimes = state.bestPostingTimes
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
      return preferredPostingTimes.length > 0
        ? [
            {
              organizationId: state.organizationId,
              preferredPostingTimes,
              strategyId: String(strategy.id),
            },
          ]
        : [];
    });
    return { ...state, items };
  }

  async persistPostingRecommendation(
    item: PostingRecommendationItem,
  ): Promise<PostingRecommendationItem> {
    await this.agentStrategiesService.patch(item.strategyId, {
      preferredPostingTimes: item.preferredPostingTimes,
    });
    this.logger.debug(`${this.logContext} stored posting recommendations`, {
      organizationId: item.organizationId,
      preferredTimes: item.preferredPostingTimes,
      strategyId: item.strategyId,
    });
    return item;
  }

  planTriggerGroups(
    state: TriggerEvaluationState,
  ): TriggerEvaluationState & { items: TriggeredCampaignDispatchInput[] } {
    if (state.skippedReason) return { ...state, items: [] };
    const dispatchGroups = this.buildDispatchGroups(state);
    if (dispatchGroups.length === 0) {
      return {
        ...state,
        dispatchGroups,
        items: [],
        skippedReason:
          'No trigger thresholds were met for the current evaluation window.',
      };
    }
    const items = dispatchGroups.map((group) => ({
      campaignId: state.campaignId,
      contentMixSummary: this.buildContentMixSummary(
        group.strategies[0],
        state.topContent,
      ),
      organizationId: state.organizationId,
      postingRecommendations: state.bestPostingTimes,
      strategies: group.strategies,
      triggerContextLines: group.contextLines,
      triggerMetadata: group.metadata,
      triggerSummary: group.summary,
      triggerType: group.type,
    }));
    return { ...state, dispatchGroups, items };
  }

  finalizeEvaluation(
    state: TriggerEvaluationState,
    results: ContentEngineCycleResult[],
  ): TriggerEvaluationResult {
    const dispatchCount = results.reduce(
      (total, result) => total + result.dispatchCount,
      0,
    );
    const dispatchedTriggerTypes = (state.dispatchGroups ?? [])
      .filter((_group, index) => (results[index]?.dispatchCount ?? 0) > 0)
      .map((group) => group.type);
    const skippedReason = state.skippedReason;
    const summary = skippedReason
      ? skippedReason
      : dispatchCount > 0
        ? `Trigger evaluation dispatched ${dispatchCount} run(s) across ${dispatchedTriggerTypes.join(', ')}.`
        : 'Trigger evaluation completed without any dispatches.';
    return {
      campaignId: state.campaignId,
      dispatchCount,
      dispatchedTriggerTypes,
      ...(skippedReason ? { skippedReason } : {}),
      summary,
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
    scope: CampaignAnalyticsScope,
  ): Promise<AnalyticsOverviewSnapshot> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    return (await this.analyticsService.getOverview(
      sevenDaysAgo.toISOString(),
      now.toISOString(),
      scope.brandId,
      scope.organizationId,
    )) as AnalyticsOverviewSnapshot;
  }

  private async loadBestPostingTimes(
    scope: CampaignAnalyticsScope,
  ): Promise<AnalyticsBestPostingTime[]> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);

    return await this.analyticsService.getBestPostingTimes(
      thirtyDaysAgo.toISOString(),
      now.toISOString(),
      scope.brandId,
      scope.organizationId,
    );
  }

  private async loadTopContent(
    scope: CampaignAnalyticsScope,
  ): Promise<TopContentEntry[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    return (await this.analyticsService.getTopContent(
      sevenDaysAgo.toISOString(),
      now.toISOString(),
      5,
      AnalyticsMetric.ENGAGEMENT,
      scope.brandId,
      undefined,
      scope.organizationId,
    )) as TopContentEntry[];
  }

  private async loadCurrentTrends(
    scope: CampaignAnalyticsScope,
  ): Promise<TriggerTrendEntry[]> {
    try {
      return await this.trendsService.getTrends(
        scope.organizationId,
        scope.brandId,
        undefined,
        {
          allowFetchIfMissing: false,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(`${this.logContext} trends unavailable`, {
        campaignId: scope.campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async loadBrandDescription(
    scope: CampaignAnalyticsScope,
  ): Promise<string> {
    // Fail closed on an unresolvable brand id so this never becomes an unscoped
    // lookup that returns an unrelated brand.
    if (!scope.brandId) {
      return '';
    }

    const brand = await this.brandsService.findOne({
      id: scope.brandId,
      organizationId: scope.organizationId,
    });

    if (!brand) {
      return '';
    }

    return [brand.label, brand.description, brand.text]
      .filter((value): value is string => Boolean(value))
      .join(' ');
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
        strategies.forEach((strategy) => {
          claimedStrategyIds.add(String(strategy.id));
        });
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
        strategies.forEach((strategy) => {
          claimedStrategyIds.add(String(strategy.id));
        });
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
      .filter((strategy) => !claimedStrategyIds.has(String(strategy.id)))
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
