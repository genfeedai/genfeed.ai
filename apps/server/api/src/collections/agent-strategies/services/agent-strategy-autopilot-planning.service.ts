import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import {
  computePriorityScore,
  computeTopicRelevance,
  DEFAULT_EVENT_OPPORTUNITY_COST,
  DEFAULT_TEXT_OPPORTUNITY_COST,
  estimateOpportunityCost,
  strategyBrandId as getStrategyBrandId,
  strategyId as getStrategyId,
  strategyOrganizationId as getStrategyOrganizationId,
  resolveFormatsForStrategy,
  strategyPlatforms,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type { BudgetPacingState } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

interface OpportunityPlanningContext {
  day: string;
  defaultTopic: string;
  expiresAt: Date;
  platforms: string[];
  strategyBrandId: string | undefined;
  strategyId: string;
  strategyOrganizationId: string;
}

@Injectable()
export class AgentStrategyAutopilotPlanningService {
  constructor(
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly trendsService: TrendsService,
    private readonly performanceService: AgentStrategyAutopilotPerformanceService,
    private readonly logger: LoggerService,
  ) {}

  computeBudgetPacingState(strategy: AgentStrategyDocument): BudgetPacingState {
    const monthBudget = strategy.budgetPolicy?.monthlyCreditBudget ?? 500;
    const now = new Date();
    const daysInMonth = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      0,
    ).getUTCDate();
    const currentDay = now.getUTCDate();
    const expectedSpendToDate = Number(
      ((monthBudget / daysInMonth) * currentDay).toFixed(2),
    );

    return {
      expectedSpendToDate,
      monthBudget,
      monthToDateCreditsUsed: strategy.monthToDateCreditsUsed ?? 0,
      remainingDailyBudget: Math.max(
        0,
        (strategy.dailyCreditBudget ?? 0) - (strategy.dailyCreditsUsed ?? 0),
      ),
      remainingMonthlyBudget: Math.max(
        0,
        monthBudget - (strategy.monthToDateCreditsUsed ?? 0),
      ),
      remainingWeeklyBudget: Math.max(
        0,
        (strategy.weeklyCreditBudget ?? 0) -
          (strategy.creditsUsedThisWeek ?? 0),
      ),
      reserveTrendBudgetRemaining:
        strategy.reserveTrendBudgetRemaining ??
        strategy.budgetPolicy?.reserveTrendBudget ??
        0,
    };
  }

  async refreshOpportunities(
    strategy: AgentStrategyDocument,
    refreshTrends = false,
  ): Promise<AgentStrategyOpportunityDocument[]> {
    await this.performanceService.reconcilePublications(strategy);
    const context = this.buildOpportunityContext(strategy);

    await this.collectTrendOpportunities(strategy, context, refreshTrends);
    await this.collectEventOpportunities(strategy, context);
    await this.collectEvergreenOpportunities(strategy, context);

    return this.opportunitiesService.listOpenByStrategy(
      context.strategyId,
      context.strategyOrganizationId,
    );
  }

  private buildOpportunityContext(
    strategy: AgentStrategyDocument,
  ): OpportunityPlanningContext {
    const platforms = strategyPlatforms(strategy);
    const localNow = DateTime.fromJSDate(new Date(), {
      zone: strategy.timezone || 'UTC',
    });
    const day = localNow.toFormat('yyyy-MM-dd');
    const expiresAt = localNow
      .plus({ days: 1 })
      .startOf('day')
      .toUTC()
      .toJSDate();
    const topics = strategy.topics?.length
      ? strategy.topics
      : [strategy.label || 'General update'];
    const defaultTopic =
      topics[Math.floor(Date.parse(day) / 86_400_000) % topics.length];

    return {
      day,
      defaultTopic,
      expiresAt,
      platforms,
      strategyBrandId: getStrategyBrandId(strategy),
      strategyId: getStrategyId(strategy),
      strategyOrganizationId: getStrategyOrganizationId(strategy),
    };
  }

  private async collectTrendOpportunities(
    strategy: AgentStrategyDocument,
    context: OpportunityPlanningContext,
    refreshTrends: boolean,
  ): Promise<void> {
    const { platforms, strategyBrandId, strategyId, strategyOrganizationId } =
      context;
    if (!strategy.opportunitySources?.trendWatchersEnabled || !strategyBrandId)
      return;

    for (const platform of platforms.slice(0, 3)) {
      const trends = refreshTrends
        ? await this.trendsService
            .fetchAndCachePlatformTrends(
              platform,
              strategyOrganizationId,
              strategyBrandId,
            )
            .catch((error: unknown) => {
              this.logger.warn(
                'Autopilot trend refresh failed; continuing with other opportunity sources',
                {
                  organizationId: strategyOrganizationId,
                  strategyId,
                  platform,
                  error,
                },
              );
              return [];
            })
        : await this.trendsService.getTrends(
            strategyOrganizationId,
            strategyBrandId,
            platform,
            { allowFetchIfMissing: false },
          );

      for (const trend of trends.slice(0, 3)) {
        await this.opportunitiesService.createIfMissing({
          brandId: strategyBrandId,
          decisionReason: 'Trend watcher matched a current platform trend.',
          estimatedCreditCost: estimateOpportunityCost(
            resolveFormatsForStrategy(strategy),
          ),
          expectedTrafficScore: Math.min(
            100,
            Math.round(trend.viralityScore ?? 0),
          ),
          expiresAt: trend.expiresAt ? new Date(trend.expiresAt) : undefined,
          formatCandidates: resolveFormatsForStrategy(strategy),
          metadata: {
            platform,
            trendId: String(trend.id),
            viralityScore: trend.viralityScore ?? 0,
          },
          organizationId: strategyOrganizationId,
          platformCandidates: [platform],
          priorityScore: computePriorityScore(strategy, {
            costEfficiency: 100 / DEFAULT_TEXT_OPPORTUNITY_COST,
            expectedTraffic: trend.viralityScore ?? 0,
            freshness: 90,
            historicalConfidence: 50,
            relevance: computeTopicRelevance(strategy, trend.topic),
          }),
          relevanceScore: computeTopicRelevance(strategy, trend.topic),
          sourceRef: String(trend.id),
          sourceType: 'trend',
          strategyId,
          topic: trend.topic,
        });
      }
    }
  }

  private async collectEventOpportunities(
    strategy: AgentStrategyDocument,
    context: OpportunityPlanningContext,
  ): Promise<void> {
    const { platforms, strategyBrandId, strategyId, strategyOrganizationId } =
      context;
    if (!strategy.opportunitySources?.eventTriggersEnabled || !strategyBrandId)
      return;

    const snapshot = await this.performanceService.getPerformanceSnapshot(
      strategyId,
      strategyOrganizationId,
    );
    const topHook = snapshot.topHooks[0];
    if (!topHook) return;

    await this.opportunitiesService.createIfMissing({
      brandId: strategyBrandId,
      decisionReason: 'Event trigger captured a high-performing hook.',
      estimatedCreditCost: DEFAULT_EVENT_OPPORTUNITY_COST,
      expectedTrafficScore: 75,
      formatCandidates: ['text'],
      metadata: { hook: topHook, trigger: 'high-performing-hook' },
      organizationId: strategyOrganizationId,
      platformCandidates: platforms,
      priorityScore: computePriorityScore(strategy, {
        costEfficiency: 100 / DEFAULT_EVENT_OPPORTUNITY_COST,
        expectedTraffic: 75,
        freshness: 70,
        historicalConfidence: 80,
        relevance: 80,
      }),
      relevanceScore: 80,
      sourceRef: `event:hook:${topHook}`,
      sourceType: 'event',
      strategyId,
      topic: topHook,
    });
  }

  private async collectEvergreenOpportunities(
    strategy: AgentStrategyDocument,
    context: OpportunityPlanningContext,
  ): Promise<void> {
    const {
      day,
      defaultTopic,
      expiresAt,
      platforms,
      strategyBrandId,
      strategyId,
      strategyOrganizationId,
    } = context;
    if (!strategy.opportunitySources?.evergreenCadenceEnabled) return;

    const cadence =
      await this.performanceService.getPublishingCadence(strategy);
    const isBelowWeeklyTarget =
      cadence.week < (strategy.postsPerWeek ?? 0) &&
      cadence.today < Math.ceil((strategy.postsPerWeek ?? 0) / 7);
    if (!isBelowWeeklyTarget) return;

    await this.opportunitiesService.createIfMissing({
      brandId: strategyBrandId ?? '',
      decisionReason: 'Evergreen cadence filled a weekly publishing gap.',
      expiresAt,
      estimatedCreditCost: estimateOpportunityCost(
        resolveFormatsForStrategy(strategy),
      ),
      expectedTrafficScore: 55,
      formatCandidates: resolveFormatsForStrategy(strategy),
      metadata: { trigger: 'weekly-gap' },
      organizationId: strategyOrganizationId,
      platformCandidates: platforms,
      priorityScore: computePriorityScore(strategy, {
        costEfficiency: 100 / DEFAULT_TEXT_OPPORTUNITY_COST,
        expectedTraffic: 55,
        freshness: 50,
        historicalConfidence: 60,
        relevance: computeTopicRelevance(strategy, defaultTopic),
      }),
      relevanceScore: computeTopicRelevance(strategy, defaultTopic),
      sourceRef: `evergreen:${day}:${defaultTopic}`,
      sourceType: 'evergreen',
      strategyId,
      topic: defaultTopic,
    });
  }

  selectOpportunities(
    strategy: AgentStrategyDocument,
    opportunities: AgentStrategyOpportunityDocument[],
    pacing: BudgetPacingState,
  ): AgentStrategyOpportunityDocument[] {
    const selected: AgentStrategyOpportunityDocument[] = [];
    let dailyRemaining = pacing.remainingDailyBudget;
    let weeklyRemaining = pacing.remainingWeeklyBudget;
    let monthlyRemaining = pacing.remainingMonthlyBudget;
    let trendReserveRemaining = pacing.reserveTrendBudgetRemaining;
    const isOverPace =
      pacing.monthToDateCreditsUsed > pacing.expectedSpendToDate &&
      pacing.expectedSpendToDate > 0;

    for (const opportunity of opportunities.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      if (b.expectedTrafficScore !== a.expectedTrafficScore) {
        return b.expectedTrafficScore - a.expectedTrafficScore;
      }
      return a.estimatedCreditCost - b.estimatedCreditCost;
    })) {
      if (
        opportunity.expiresAt &&
        new Date(opportunity.expiresAt).getTime() <= Date.now()
      )
        continue;
      if (opportunity.status !== 'queued') {
        continue;
      }

      if (opportunity.estimatedCreditCost > dailyRemaining) {
        continue;
      }
      if (opportunity.estimatedCreditCost > weeklyRemaining) {
        continue;
      }
      if (opportunity.estimatedCreditCost > monthlyRemaining) {
        continue;
      }

      if (isOverPace && opportunity.sourceType !== 'trend') {
        continue;
      }

      if (
        isOverPace &&
        opportunity.sourceType === 'trend' &&
        opportunity.estimatedCreditCost > trendReserveRemaining
      ) {
        continue;
      }

      if (
        strategy.agentType === 'video_creator' ||
        opportunity.formatCandidates.includes('video')
      ) {
        continue;
      }

      selected.push(opportunity);
      dailyRemaining -= opportunity.estimatedCreditCost;
      weeklyRemaining -= opportunity.estimatedCreditCost;
      monthlyRemaining -= opportunity.estimatedCreditCost;
      if (opportunity.sourceType === 'trend') {
        trendReserveRemaining -= opportunity.estimatedCreditCost;
      }
    }

    return selected;
  }
}
