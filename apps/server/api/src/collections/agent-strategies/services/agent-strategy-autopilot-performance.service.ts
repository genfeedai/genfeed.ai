import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
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
import type { ContentPerformanceDocument } from '@api/collections/content-performance/schemas/content-performance.schema';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

interface SnapshotSources {
  posts: PostDocument[];
  opportunities: AgentStrategyOpportunityDocument[];
  performance: ContentPerformanceDocument[];
  sampling: NonNullable<AgentStrategyPerformanceSnapshot['sampling']>;
}

interface SnapshotCoreMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  costPerVisit: null;
  visits: null;
  generatedCount: number;
  publishedCount: number;
  creditsSpent: number;
}

@Injectable()
export class AgentStrategyAutopilotPerformanceService {
  constructor(
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly reportsService: AgentStrategyReportsService,
    private readonly postsService: PostsService,
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly contentPerformanceService: ContentPerformanceService,
  ) {}

  async getPerformanceSnapshot(
    strategyId: string,
    organizationId: string,
    reportType: AgentStrategyReportType = 'weekly',
  ): Promise<AgentStrategyPerformanceSnapshot> {
    const strategy = await this.requireStrategy(strategyId, organizationId);
    const { periodEnd, periodStart } = resolveReportWindow(reportType);

    const { posts, opportunities, performance, sampling } =
      await this.fetchSnapshotSources(
        strategy,
        strategyId,
        organizationId,
        periodStart,
        periodEnd,
      );
    const latest = this.buildLatestMeasurementMap(performance);
    const ranked = [...latest.values()];

    return {
      bestPlatformFormatPairs: this.computeBestPlatformFormatPairs(ranked),
      bestPostingWindows: this.computeBestPostingWindows(
        posts,
        latest,
        strategy,
      ),
      sampling,
      topHooks: this.computeTopHooks(ranked),
      topTopics: this.computeTopTopics(opportunities, ranked),
      ...this.computeCoreMetrics(posts, ranked, opportunities, {
        periodEnd,
        periodStart,
      }),
    };
  }

  private async fetchSnapshotSources(
    strategy: AgentStrategyDocument,
    strategyId: string,
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<SnapshotSources> {
    const strategyBrandId = getStrategyBrandId(strategy);
    const strategyOrganizationId = getStrategyOrganizationId(strategy);
    const sampleLimit = 250;

    const [postPage, opportunities, measurementPage] = await Promise.all([
      this.postsService.findAll(
        {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          where: scopedWhere(strategyOrganizationId, {
            agentStrategyId: strategyId,
            brandId: strategyBrandId ?? '',
            OR: [
              { createdAt: { gte: periodStart, lte: periodEnd } },
              { publishedAt: { gte: periodStart, lte: periodEnd } },
            ],
          }),
        },
        { limit: sampleLimit, page: 1, pagination: true },
        false,
      ),
      this.opportunitiesService.listByStrategy(strategyId, organizationId),
      this.contentPerformanceService.findAll(
        {
          orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
          where: scopedWhere(organizationId, {
            measuredAt: { gte: periodStart, lte: periodEnd },
            post: scopedWhere(organizationId, {
              agentStrategyId: strategyId,
              brandId: strategyBrandId ?? '',
            }),
          }),
        },
        { limit: sampleLimit, page: 1, pagination: true },
        false,
      ),
    ]);
    const posts = postPage.docs;
    const performance = measurementPage.docs;

    return {
      opportunities,
      performance,
      posts,
      sampling: {
        limit: sampleLimit,
        matchedPosts: postPage.totalDocs,
        matchedMeasurements: measurementPage.totalDocs,
        postsSampled: posts.length,
        measurementsSampled: performance.length,
        truncated: postPage.hasNextPage || measurementPage.hasNextPage,
      },
    };
  }

  private buildLatestMeasurementMap(
    measurements: ContentPerformanceDocument[],
  ): Map<string, ContentPerformanceDocument> {
    const latest = new Map<string, ContentPerformanceDocument>();
    for (const measurement of measurements) {
      if (!measurement.postId) continue;
      const previous = latest.get(measurement.postId);
      if (
        !previous ||
        new Date(measurement.measuredAt ?? 0).getTime() >
          new Date(previous.measuredAt ?? 0).getTime()
      ) {
        latest.set(measurement.postId, measurement);
      }
    }
    return latest;
  }

  private computeCoreMetrics(
    posts: PostDocument[],
    performance: ContentPerformanceDocument[],
    opportunities: AgentStrategyOpportunityDocument[],
    period: { periodEnd: Date; periodStart: Date },
  ): SnapshotCoreMetrics {
    const { periodEnd, periodStart } = period;
    const impressions = performance.reduce((sum, item) => sum + item.views, 0);
    const clicks = performance.reduce(
      (sum, item) => sum + (item.clicks ?? 0),
      0,
    );
    const generatedCount = posts.filter(
      (post) => post.createdAt >= periodStart && post.createdAt <= periodEnd,
    ).length;
    const publishedCount = posts.filter(
      (post) =>
        post.targetExecutionState === TargetExecutionState.PUBLISHED &&
        post.publishedAt &&
        post.publishedAt >= periodStart &&
        post.publishedAt <= periodEnd,
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

    return {
      clicks,
      costPerVisit: null,
      creditsSpent,
      ctr,
      generatedCount,
      impressions,
      publishedCount,
      visits: null,
    };
  }

  private computeTopTopics(
    opportunities: AgentStrategyOpportunityDocument[],
    performance: ContentPerformanceDocument[],
  ): string[] {
    const topicScores = new Map<string, number>();
    for (const opportunity of opportunities) {
      const postIds = opportunity.metadata?.postIds;
      if (!Array.isArray(postIds)) continue;
      const score = performance
        .filter((item) => postIds.includes(item.postId))
        .reduce((sum, item) => sum + (item.performanceScore ?? 0), 0);
      if (score > 0)
        topicScores.set(
          opportunity.topic,
          (topicScores.get(opportunity.topic) ?? 0) + score,
        );
    }
    return [...topicScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  private computeBestPlatformFormatPairs(
    performance: ContentPerformanceDocument[],
  ): AgentStrategyPerformanceSnapshot['bestPlatformFormatPairs'] {
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
    return [...pairScores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private computeBestPostingWindows(
    posts: PostDocument[],
    latest: Map<string, ContentPerformanceDocument>,
    strategy: AgentStrategyDocument,
  ): string[] {
    const postingWindows = new Map<string, number>();
    for (const post of posts) {
      const measured = latest.get(post.id);
      if (!post.publishedAt || !measured) continue;
      const hour = new Intl.DateTimeFormat('en-GB', {
        timeZone: strategy.timezone || 'UTC',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(post.publishedAt));
      postingWindows.set(
        hour,
        (postingWindows.get(hour) ?? 0) + measured.performanceScore,
      );
    }
    return [...postingWindows.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => `${hour}:00`);
  }

  private computeTopHooks(performance: ContentPerformanceDocument[]): string[] {
    return [
      ...new Set(
        performance
          .sort((a, b) => b.performanceScore - a.performanceScore)
          .map((item) => item.hookUsed)
          .filter((hook): hook is string => Boolean(hook)),
      ),
    ].slice(0, 5);
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
      reportType,
    );
    const { periodEnd, periodStart } = resolveReportWindow(reportType);

    const allocationChanges = snapshot.bestPlatformFormatPairs
      .slice(0, 2)
      .map(
        (pair) =>
          `Bias next runs toward ${pair.platform}/${pair.format} based on current performance.`,
      );

    if (snapshot.sampling?.truncated) {
      allocationChanges.push(
        `Performance report is a bounded sample of up to ${snapshot.sampling.limit} posts and measurements; displayed metrics are not complete strategy totals.`,
      );
    }

    return this.reportsService.createReport({
      allocationChanges,
      bestPlatformFormatPairs: snapshot.bestPlatformFormatPairs,
      bestPostingWindows: snapshot.bestPostingWindows,
      brandId: getStrategyBrandId(strategy) ?? '',
      clicks: snapshot.clicks,
      costPerVisit: snapshot.costPerVisit,
      creditsSpent: snapshot.creditsSpent,
      ctr: snapshot.ctr,
      generatedCount: snapshot.generatedCount,
      impressions: snapshot.impressions,
      organizationId: getStrategyOrganizationId(strategy),
      metadata: {
        visitsAvailable: false,
        costPerVisitAvailable: false,
        sampling: snapshot.sampling,
        measurementBasis:
          'latest cumulative post metrics observed within the report period',
      },
      periodEnd,
      periodStart,
      publishedCount: snapshot.publishedCount,
      reportType,
      strategyId: getStrategyId(strategy),
      topHooks: snapshot.topHooks,
      topTopics: snapshot.topTopics,
      visits: snapshot.visits,
    });
  }

  async getPublishingCadence(
    strategy: AgentStrategyDocument,
  ): Promise<{ today: number; week: number }> {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86_400_000);
    const posts = await this.postsService.find(
      scopedWhere(getStrategyOrganizationId(strategy), {
        agentStrategyId: getStrategyId(strategy),
        targetExecutionState: {
          in: [
            TargetExecutionState.SCHEDULED,
            TargetExecutionState.PUBLISHING,
            TargetExecutionState.PUBLISHED,
          ],
        },
        OR: [
          { scheduledDate: { gte: weekStart, lte: now } },
          { publishedAt: { gte: weekStart, lte: now } },
        ],
      }),
    );
    const dayKey = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: strategy.timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    const today = new Set<string>();
    const week = new Set<string>();
    for (const post of posts) {
      const date = post.publishedAt ?? post.scheduledDate;
      if (!date || new Date(date).getTime() < weekStart.getTime()) continue;
      const key = post.groupId || post.id;
      week.add(key);
      if (dayKey(new Date(date)) === dayKey(now)) today.add(key);
    }
    return { today: today.size, week: week.size };
  }

  async reconcilePublications(strategy: AgentStrategyDocument): Promise<void> {
    const organizationId = getStrategyOrganizationId(strategy);
    const opportunities = await this.opportunitiesService.listByStrategy(
      getStrategyId(strategy),
      organizationId,
      { statuses: ['approved'] },
    );
    for (const opportunity of opportunities) {
      const ids = opportunity.metadata?.postIds;
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        !ids.every((id) => typeof id === 'string')
      )
        continue;
      const posts = await this.postsService.find(
        scopedWhere(organizationId, {
          agentStrategyId: getStrategyId(strategy),
          id: { in: ids },
        }),
      );
      if (
        posts.length === ids.length &&
        posts.every(
          (post) =>
            post.targetExecutionState === TargetExecutionState.PUBLISHED,
        )
      ) {
        await this.opportunitiesService.updateStatus(
          opportunity.id,
          organizationId,
          'published',
          {
            decisionReason:
              'All linked account posts have confirmed publication.',
          },
        );
      } else if (
        posts.length !== ids.length ||
        posts.some(
          (post) => post.targetExecutionState === TargetExecutionState.FAILED,
        )
      ) {
        await this.opportunitiesService.updateStatus(
          opportunity.id,
          organizationId,
          'held',
          {
            decisionReason:
              posts.length !== ids.length
                ? 'A linked account post is missing or deleted; inspect remaining posts before retrying.'
                : 'An account publication failed; inspect linked posts before retrying.',
          },
        );
      }
    }
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
