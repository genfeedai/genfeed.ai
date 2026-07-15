import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import {
  strategyBrandId as getStrategyBrandId,
  strategyId as getStrategyId,
  strategyOrganizationId as getStrategyOrganizationId,
  resolveReportWindow,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type { AgentStrategyPerformanceSnapshot } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ContentDraftStatus } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { PerformanceSummaryService } from '@server/collections/content-performance/services/performance-summary.service';

@Injectable()
export class AgentStrategyAutopilotPerformanceService {
  constructor(
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly reportsService: AgentStrategyReportsService,
    private readonly contentDraftsService: ContentDraftsService,
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly contentPerformanceService: ContentPerformanceService,
    private readonly performanceSummaryService: PerformanceSummaryService,
  ) {}

  async getPerformanceSnapshot(
    strategyId: string,
    organizationId: string,
  ): Promise<AgentStrategyPerformanceSnapshot> {
    const strategy = await this.requireStrategy(strategyId, organizationId);
    const { periodEnd, periodStart } = resolveReportWindow('weekly');

    const strategyBrandId = getStrategyBrandId(strategy);
    const strategyOrganizationId = getStrategyOrganizationId(strategy);

    const [drafts, opportunities, performance, summary] = await Promise.all([
      this.contentDraftsService.find({
        brandId: strategyBrandId ?? String(strategy.brand),
        createdAt: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
        organizationId: strategyOrganizationId,
      }),
      this.opportunitiesService.listByStrategy(strategyId, organizationId),
      strategy.brand
        ? this.contentPerformanceService.queryPerformance(
            {
              brand: String(strategyBrandId),
              endDate: periodEnd.toISOString(),
              limit: 250,
              startDate: periodStart.toISOString(),
            },
            organizationId,
          )
        : [],
      strategy.brand
        ? this.performanceSummaryService
            .getWeeklySummary(organizationId, String(strategyBrandId), {
              endDate: periodEnd,
              startDate: periodStart,
            })
            .catch(() => null)
        : null,
    ]);

    const impressions = performance.reduce((sum, item) => sum + item.views, 0);
    const clicks = performance.reduce((sum, item) => sum + item.clicks, 0);
    const visits = clicks;
    const generatedCount = drafts.length;
    const publishedCount = drafts.filter(
      (draft) =>
        String(draft.status ?? '').toLowerCase() ===
        ContentDraftStatus.PUBLISHED,
    ).length;
    const creditsSpent = opportunities
      .filter((opportunity) => {
        const createdAt = opportunity.createdAt;
        return (
          ['approved', 'published'].includes(opportunity.status) &&
          createdAt instanceof Date &&
          createdAt >= periodStart &&
          createdAt <= periodEnd
        );
      })
      .reduce((sum, opportunity) => sum + opportunity.estimatedCreditCost, 0);
    const ctr =
      impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    const costPerVisit =
      visits > 0 ? Number((creditsSpent / visits).toFixed(2)) : 0;

    const topicCounts = new Map<string, number>();
    for (const opportunity of opportunities) {
      const createdAt = opportunity.createdAt;
      if (
        !(createdAt instanceof Date) ||
        createdAt < periodStart ||
        createdAt > periodEnd
      ) {
        continue;
      }
      topicCounts.set(
        opportunity.topic,
        (topicCounts.get(opportunity.topic) ?? 0) + 1,
      );
    }

    const topTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    const pairScores = new Map<
      string,
      { format: string; platform: string; score: number }
    >();
    for (const item of performance) {
      const key = `${item.platform}:${item.contentType}`;
      const existing = pairScores.get(key) ?? {
        format: String(item.contentType),
        platform: String(item.platform),
        score: 0,
      };
      existing.score += item.performanceScore ?? 0;
      pairScores.set(key, existing);
    }

    return {
      bestPlatformFormatPairs: [...pairScores.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
      bestPostingWindows:
        summary?.bestPostingTimes
          ?.slice(0, 3)
          .map((item) => `${item.hour}:00`) ?? [],
      clicks,
      costPerVisit,
      creditsSpent,
      ctr,
      generatedCount,
      impressions,
      publishedCount,
      topHooks: summary?.topHooks ?? [],
      topTopics,
      visits,
    };
  }

  async generateStrategyReport(
    strategyId: string,
    organizationId: string,
    reportType: AgentStrategyReportType = 'daily',
  ) {
    const strategy = await this.requireStrategy(strategyId, organizationId);
    const snapshot = await this.getPerformanceSnapshot(
      strategyId,
      organizationId,
    );
    const { periodEnd, periodStart } = resolveReportWindow(reportType);

    const allocationChanges = snapshot.bestPlatformFormatPairs
      .slice(0, 2)
      .map(
        (pair) =>
          `Bias next runs toward ${pair.platform}/${pair.format} based on current performance.`,
      );

    return this.reportsService.createReport({
      allocationChanges,
      bestPlatformFormatPairs: snapshot.bestPlatformFormatPairs,
      bestPostingWindows: snapshot.bestPostingWindows,
      brandId: getStrategyBrandId(strategy) ?? String(strategy.brand),
      clicks: snapshot.clicks,
      costPerVisit: snapshot.costPerVisit,
      creditsSpent: snapshot.creditsSpent,
      ctr: snapshot.ctr,
      generatedCount: snapshot.generatedCount,
      impressions: snapshot.impressions,
      organizationId: getStrategyOrganizationId(strategy),
      periodEnd,
      periodStart,
      publishedCount: snapshot.publishedCount,
      reportType,
      strategyId: getStrategyId(strategy),
      topHooks: snapshot.topHooks,
      topTopics: snapshot.topTopics,
      visits: snapshot.visits,
    } as never);
  }

  private async requireStrategy(
    strategyId: string,
    organizationId: string,
  ): Promise<AgentStrategyDocument> {
    const strategy = await this.agentStrategiesService.findOneById(
      strategyId,
      organizationId,
    );

    if (!strategy) {
      throw new NotFoundException('Strategy');
    }

    return strategy;
  }
}
