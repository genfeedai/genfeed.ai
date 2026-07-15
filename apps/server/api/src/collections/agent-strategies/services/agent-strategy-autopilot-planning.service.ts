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
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentStrategyAutopilotPlanningService {
  constructor(
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly trendsService: TrendsService,
    private readonly performanceService: AgentStrategyAutopilotPerformanceService,
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
  ): Promise<AgentStrategyOpportunityDocument[]> {
    const created: AgentStrategyOpportunityDocument[] = [];
    const platforms = strategyPlatforms(strategy);
    const defaultTopic =
      strategy.topics?.[0] ?? strategy.label ?? 'General update';
    const strategyBrandId = getStrategyBrandId(strategy);
    const strategyId = getStrategyId(strategy);
    const strategyOrganizationId = getStrategyOrganizationId(strategy);

    if (strategy.opportunitySources?.trendWatchersEnabled && strategyBrandId) {
      for (const platform of platforms.slice(0, 3)) {
        const trends = await this.trendsService.getTrends(
          strategyOrganizationId,
          strategyBrandId,
          platform,
          { allowFetchIfMissing: false },
        );

        for (const trend of trends.slice(0, 3)) {
          created.push(
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
              expiresAt: trend.expiresAt
                ? new Date(trend.expiresAt)
                : undefined,
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
            }),
          );
        }
      }
    }

    if (strategy.opportunitySources?.eventTriggersEnabled && strategyBrandId) {
      const snapshot = await this.performanceService.getPerformanceSnapshot(
        strategyId,
        strategyOrganizationId,
      );
      const topHook = snapshot.topHooks[0];

      if (topHook) {
        created.push(
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
          }),
        );
      }
    }

    if (strategy.opportunitySources?.evergreenCadenceEnabled) {
      const recentPublishedCount = strategy.runHistory.filter((item) => {
        if (!item.completedAt) {
          return false;
        }
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        return item.completedAt >= sevenDaysAgo;
      }).length;

      if (recentPublishedCount < (strategy.postsPerWeek ?? 0)) {
        created.push(
          await this.opportunitiesService.createIfMissing({
            brandId: strategyBrandId ?? '',
            decisionReason: 'Evergreen cadence filled a weekly publishing gap.',
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
            sourceRef: `evergreen:${defaultTopic}`,
            sourceType: 'evergreen',
            strategyId,
            topic: defaultTopic,
          }),
        );
      }
    }

    return this.opportunitiesService.listOpenByStrategy(
      strategyId,
      strategyOrganizationId,
    );
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
