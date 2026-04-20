import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { type AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { type AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { ReviewBatchItemFormat } from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ContentDraftStatus,
  ContentFormat,
  IngredientCategory,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface BudgetPacingState {
  expectedSpendToDate: number;
  monthBudget: number;
  monthToDateCreditsUsed: number;
  remainingDailyBudget: number;
  remainingMonthlyBudget: number;
  remainingWeeklyBudget: number;
  reserveTrendBudgetRemaining: number;
}

export interface PublishGateResult {
  decision: 'approved' | 'discard' | 'hold' | 'revise';
  overallScore: number;
  reasons: string[];
  revisionInstructions: string[];
  scoreBreakdown: Record<string, number>;
}

export interface AgentStrategyPerformanceSnapshot {
  bestPlatformFormatPairs: Array<{
    format: string;
    platform: string;
    score: number;
  }>;
  bestPostingWindows: string[];
  clicks: number;
  costPerVisit: number;
  creditsSpent: number;
  ctr: number;
  generatedCount: number;
  impressions: number;
  publishedCount: number;
  topHooks: string[];
  topTopics: string[];
  visits: number;
}

interface ExecuteRunResult {
  contentGenerated: number;
  creditsUsed: number;
  summary: string;
}

@Injectable()
export class AgentStrategyAutopilotService {
  private readonly defaultEventOpportunityCost = 12;
  private readonly defaultImageOpportunityCost = 24;
  private readonly defaultTextOpportunityCost = 10;

  constructor(
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly reportsService: AgentStrategyReportsService,
    private readonly activitiesService: ActivitiesService,
    private readonly trendsService: TrendsService,
    private readonly brandsService: BrandsService,
    private readonly contentGatewayService: ContentGatewayService,
    private readonly contentDraftsService: ContentDraftsService,
    private readonly optimizersService: OptimizersService,
    private readonly evaluationsOperationsService: EvaluationsOperationsService,
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly contentPerformanceService: ContentPerformanceService,
    private readonly performanceSummaryService: PerformanceSummaryService,
    private readonly logger: LoggerService,
  ) {}

  async listStrategyOpportunities(
    strategyId: string,
    organizationId: string,
  ): Promise<AgentStrategyOpportunityDocument[]> {
    const strategy = await this.requireStrategy(strategyId, organizationId);
    await this.refreshOpportunities(strategy);
    return this.opportunitiesService.listOpenByStrategy(
      strategyId,
      organizationId,
    );
  }

  async getPerformanceSnapshot(
    strategyId: string,
    organizationId: string,
  ): Promise<AgentStrategyPerformanceSnapshot> {
    const strategy = await this.requireStrategy(strategyId, organizationId);
    const { periodEnd, periodStart } = this.resolveReportWindow('weekly');

    const [drafts, opportunities, performance, summary] = await Promise.all([
      this.contentDraftsService.find({
        brandId:
          (strategy as Record<string, unknown>).brandId ??
          String(
            (strategy as Record<string, unknown>).brandId ?? strategy.brand,
          ),
        createdAt: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
        organizationId:
          (strategy as Record<string, unknown>).organizationId ??
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
      }),
      this.opportunitiesService.listByStrategy(strategyId, organizationId),
      strategy.brand
        ? this.contentPerformanceService.queryPerformance(
            {
              brand: String(
                (strategy as Record<string, unknown>).brandId ?? strategy.brand,
              ),
              endDate: periodEnd.toISOString(),
              limit: 250,
              startDate: periodStart.toISOString(),
            },
            organizationId,
          )
        : [],
      strategy.brand
        ? this.performanceSummaryService
            .getWeeklySummary(
              organizationId,
              String(
                (strategy as Record<string, unknown>).brandId ?? strategy.brand,
              ),
              {
                endDate: periodEnd,
                startDate: periodStart,
              },
            )
            .catch(() => null)
        : null,
    ]);

    const impressions = performance.reduce((sum, item) => sum + item.views, 0);
    const clicks = performance.reduce((sum, item) => sum + item.clicks, 0);
    const visits = clicks;
    const generatedCount = drafts.length;
    const publishedCount = drafts.filter(
      (draft) => draft.status === ContentDraftStatus.PUBLISHED,
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
    const { periodEnd, periodStart } = this.resolveReportWindow(reportType);

    const allocationChanges = snapshot.bestPlatformFormatPairs
      .slice(0, 2)
      .map(
        (pair) =>
          `Bias next runs toward ${pair.platform}/${pair.format} based on current performance.`,
      );

    const strategyRecord = strategy as Record<string, unknown>;
    return this.reportsService.createReport({
      allocationChanges,
      bestPlatformFormatPairs: snapshot.bestPlatformFormatPairs,
      bestPostingWindows: snapshot.bestPostingWindows,
      brandId:
        strategyRecord.brandId ??
        String((strategy as Record<string, unknown>).brandId ?? strategy.brand),
      clicks: snapshot.clicks,
      costPerVisit: snapshot.costPerVisit,
      creditsSpent: snapshot.creditsSpent,
      ctr: snapshot.ctr,
      generatedCount: snapshot.generatedCount,
      impressions: snapshot.impressions,
      organizationId:
        strategyRecord.organizationId ??
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
      periodEnd,
      periodStart,
      publishedCount: snapshot.publishedCount,
      reportType,
      strategyId:
        strategyRecord.id ??
        String((strategy as Record<string, unknown>).id ?? strategy._id),
      topHooks: snapshot.topHooks,
      topTopics: snapshot.topTopics,
      visits: snapshot.visits,
    } as never);
  }

  async executeQueuedRun(input: {
    defaultModel?: string;
    organizationId: string;
    runId: string;
    strategyId: string;
    userId: string;
  }): Promise<ExecuteRunResult> {
    const strategy = await this.requireStrategy(
      input.strategyId,
      input.organizationId,
    );
    const pacing = this.computeBudgetPacingState(strategy);

    await this.opportunitiesService.expireStaleOpportunities(strategy);
    const opportunities = await this.refreshOpportunities(strategy);
    const selected = this.selectOpportunities(strategy, opportunities, pacing);

    if (selected.length === 0) {
      return {
        contentGenerated: 0,
        creditsUsed: 0,
        summary:
          'No autopilot opportunities were selected because pacing or policy constraints blocked execution.',
      };
    }

    let generatedCount = 0;
    let creditsUsed = 0;

    for (const opportunity of selected) {
      const result = await this.executeOpportunity(
        strategy,
        opportunity,
        input.userId,
        input.defaultModel,
      );
      generatedCount += result.contentGenerated;
      creditsUsed += result.creditsUsed;
    }

    await this.agentStrategiesService.patch(input.strategyId, {
      expectedSpendToDate: pacing.expectedSpendToDate,
      monthToDateCreditsUsed: strategy.monthToDateCreditsUsed + creditsUsed,
      reserveTrendBudgetRemaining: Math.max(
        0,
        pacing.reserveTrendBudgetRemaining -
          selected
            .filter((item) => item.sourceType === 'trend')
            .reduce((sum, item) => sum + item.estimatedCreditCost, 0),
      ),
    } as never);

    const reportType: AgentStrategyReportType = strategy.reportingPolicy
      ?.dailyDigestEnabled
      ? 'daily'
      : 'weekly';
    await this.generateStrategyReport(
      input.strategyId,
      input.organizationId,
      reportType,
    );

    return {
      contentGenerated: generatedCount,
      creditsUsed,
      summary: `Autopilot processed ${selected.length} opportunities and generated ${generatedCount} content items.`,
    };
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
      throw new NotFoundException('Strategy not found');
    }

    return strategy;
  }

  private computeBudgetPacingState(
    strategy: AgentStrategyDocument,
  ): BudgetPacingState {
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

  private async refreshOpportunities(
    strategy: AgentStrategyDocument,
  ): Promise<AgentStrategyOpportunityDocument[]> {
    const created: AgentStrategyOpportunityDocument[] = [];
    const platforms = strategy.platforms?.length
      ? strategy.platforms
      : ['twitter'];
    const defaultTopic = strategy.topics?.[0] ?? strategy.label;

    if (strategy.opportunitySources?.trendWatchersEnabled && strategy.brand) {
      for (const platform of platforms.slice(0, 3)) {
        const trends = await this.trendsService.getTrends(
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          String(
            (strategy as Record<string, unknown>).brandId ?? strategy.brand,
          ),
          platform,
          { allowFetchIfMissing: false },
        );

        for (const trend of trends.slice(0, 3)) {
          created.push(
            await this.opportunitiesService.createIfMissing({
              brandId:
                (strategy as Record<string, unknown>).brandId ??
                String(
                  (strategy as Record<string, unknown>).brandId ??
                    strategy.brand,
                ),
              decisionReason: 'Trend watcher matched a current platform trend.',
              estimatedCreditCost: this.estimateOpportunityCost(
                this.resolveFormatsForStrategy(strategy),
              ),
              expectedTrafficScore: Math.min(
                100,
                Math.round(trend.viralityScore ?? 0),
              ),
              expiresAt: trend.expiresAt
                ? new Date(trend.expiresAt)
                : undefined,
              formatCandidates: this.resolveFormatsForStrategy(strategy),
              metadata: {
                platform,
                trendId: String(trend._id),
                viralityScore: trend.viralityScore ?? 0,
              },
              organizationId:
                (strategy as Record<string, unknown>).organizationId ??
                String(
                  (strategy as Record<string, unknown>).organizationId ??
                    strategy.organization,
                ),
              platformCandidates: [platform],
              priorityScore: this.computePriorityScore(strategy, {
                costEfficiency: 100 / this.defaultTextOpportunityCost,
                expectedTraffic: trend.viralityScore ?? 0,
                freshness: 90,
                historicalConfidence: 50,
                relevance: this.computeTopicRelevance(strategy, trend.topic),
              }),
              relevanceScore: this.computeTopicRelevance(strategy, trend.topic),
              sourceRef: String(trend._id),
              sourceType: 'trend',
              strategyId:
                ((strategy as Record<string, unknown>).id as string) ??
                String(
                  (strategy as Record<string, unknown>).id ?? strategy._id,
                ),
              topic: trend.topic,
            }),
          );
        }
      }
    }

    if (strategy.opportunitySources?.eventTriggersEnabled && strategy.brand) {
      const snapshot = await this.getPerformanceSnapshot(
        String((strategy as Record<string, unknown>).id ?? strategy._id),
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
      );
      const topHook = snapshot.topHooks[0];

      if (topHook) {
        created.push(
          await this.opportunitiesService.createIfMissing({
            brandId:
              (strategy as Record<string, unknown>).brandId ??
              String(strategy.brand),
            decisionReason: 'Event trigger captured a high-performing hook.',
            estimatedCreditCost: this.defaultEventOpportunityCost,
            expectedTrafficScore: 75,
            formatCandidates: ['text'],
            metadata: { hook: topHook, trigger: 'high-performing-hook' },
            organizationId:
              (strategy as Record<string, unknown>).organizationId ??
              String(strategy.organization),
            platformCandidates: platforms,
            priorityScore: this.computePriorityScore(strategy, {
              costEfficiency: 100 / this.defaultEventOpportunityCost,
              expectedTraffic: 75,
              freshness: 70,
              historicalConfidence: 80,
              relevance: 80,
            }),
            relevanceScore: 80,
            sourceRef: `event:hook:${topHook}`,
            sourceType: 'event',
            strategyId:
              ((strategy as Record<string, unknown>).id as string) ??
              String(strategy._id),
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
            brandId:
              (strategy as Record<string, unknown>).brandId ??
              String(strategy.brand),
            decisionReason: 'Evergreen cadence filled a weekly publishing gap.',
            estimatedCreditCost: this.estimateOpportunityCost(
              this.resolveFormatsForStrategy(strategy),
            ),
            expectedTrafficScore: 55,
            formatCandidates: this.resolveFormatsForStrategy(strategy),
            metadata: { trigger: 'weekly-gap' },
            organizationId:
              (strategy as Record<string, unknown>).organizationId ??
              String(strategy.organization),
            platformCandidates: platforms,
            priorityScore: this.computePriorityScore(strategy, {
              costEfficiency: 100 / this.defaultTextOpportunityCost,
              expectedTraffic: 55,
              freshness: 50,
              historicalConfidence: 60,
              relevance: this.computeTopicRelevance(strategy, defaultTopic),
            }),
            relevanceScore: this.computeTopicRelevance(strategy, defaultTopic),
            sourceRef: `evergreen:${defaultTopic}`,
            sourceType: 'evergreen',
            strategyId:
              ((strategy as Record<string, unknown>).id as string) ??
              String(strategy._id),
            topic: defaultTopic,
          }),
        );
      }
    }

    return this.opportunitiesService.listOpenByStrategy(
      ((strategy as Record<string, unknown>).id as string) ??
        String((strategy as Record<string, unknown>).id ?? strategy._id),
      ((strategy as Record<string, unknown>).organizationId as string) ??
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
    );
  }

  private selectOpportunities(
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

  private async executeOpportunity(
    strategy: AgentStrategyDocument,
    opportunity: AgentStrategyOpportunityDocument,
    userId: string,
    defaultModel?: string,
  ): Promise<{ contentGenerated: number; creditsUsed: number }> {
    await this.opportunitiesService.updateStatus(
      ((opportunity as Record<string, unknown>).id as string) ??
        String(opportunity._id),
      String(
        (strategy as Record<string, unknown>).organizationId ??
          strategy.organization,
      ),
      'generating',
    );

    const format = opportunity.formatCandidates[0] ?? 'text';

    if (format === 'video') {
      await this.opportunitiesService.updateStatus(
        ((opportunity as Record<string, unknown>).id as string) ??
          String(opportunity._id),
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        'held',
        {
          decisionReason:
            'Video opportunities remain draft-only until stronger evaluation and generation support lands.',
        },
      );
      return { contentGenerated: 0, creditsUsed: 0 };
    }

    const generation = await this.contentGatewayService.processManualRequest(
      String(
        (strategy as Record<string, unknown>).organizationId ??
          strategy.organization,
      ),
      String((strategy as Record<string, unknown>).brandId ?? strategy.brand),
      format === 'image' ? 'image-generation' : 'content-writing',
      format === 'image'
        ? {
            model: defaultModel,
            prompt: this.buildImagePrompt(strategy, opportunity),
            skillSlugs: strategy.skillSlugs?.length
              ? strategy.skillSlugs
              : ['image-generation'],
          }
        : {
            model: defaultModel,
            platform:
              opportunity.platformCandidates[0] ?? strategy.platforms[0],
            skillSlugs: strategy.skillSlugs?.length
              ? strategy.skillSlugs
              : ['content-writing'],
            topic: opportunity.topic,
            variationsCount: 1,
          },
    );

    const [draft] = generation.drafts;
    if (!draft) {
      await this.opportunitiesService.updateStatus(
        ((opportunity as Record<string, unknown>).id as string) ??
          String(opportunity._id),
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        'held',
        { decisionReason: 'No content draft was produced.' },
      );
      return { contentGenerated: 0, creditsUsed: 0 };
    }

    const autopilotMetadata = {
      ...(draft.metadata ?? {}),
      autopilotFormat: format,
      autopilotOpportunityId: String(
        (opportunity as Record<string, unknown>).id ?? opportunity._id,
      ),
      autopilotSourceType: opportunity.sourceType,
      autopilotStrategyId: String(
        (strategy as Record<string, unknown>).id ?? strategy._id,
      ),
      budgetCost: opportunity.estimatedCreditCost,
      goalProfile: strategy.goalProfile,
    };

    await this.contentDraftsService.patch(
      ((draft as Record<string, unknown>).id as string) ??
        String((draft as Record<string, unknown>).id ?? draft._id),
      {
        metadata: autopilotMetadata,
      } as never,
    );

    const gate = await this.evaluateDraft(
      strategy,
      String(
        (strategy as Record<string, unknown>).organizationId ??
          strategy.organization,
      ),
      format,
      draft.content,
      draft.mediaUrls?.[0],
      opportunity.platformCandidates[0] ?? strategy.platforms[0],
    );

    if (gate.decision === 'revise' && format === 'text') {
      const optimization = await this.optimizersService.optimizeContent(
        {
          content: draft.content,
          contentType: 'caption',
          goals: ['engagement', 'reach'],
          platform: opportunity.platformCandidates[0] ?? strategy.platforms[0],
        },
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        userId,
      );

      await this.contentDraftsService.patch(
        ((draft as Record<string, unknown>).id as string) ??
          String((draft as Record<string, unknown>).id ?? draft._id),
        {
          content: optimization.optimized,
          metadata: {
            ...autopilotMetadata,
            revisionInstructions: gate.revisionInstructions,
          },
        } as never,
      );

      const revisedGate = await this.evaluateDraft(
        strategy,
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        format,
        optimization.optimized,
        undefined,
        opportunity.platformCandidates[0] ?? strategy.platforms[0],
      );

      if (revisedGate.decision !== 'approved') {
        await this.contentDraftsService.reject(
          String((draft as Record<string, unknown>).id ?? draft._id),
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          revisedGate.reasons.join(' '),
        );
        await this.opportunitiesService.updateStatus(
          ((opportunity as Record<string, unknown>).id as string) ??
            String(opportunity._id),
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          'discarded',
          { decisionReason: revisedGate.reasons.join(' ') },
        );
        return {
          contentGenerated: 1,
          creditsUsed: opportunity.estimatedCreditCost,
        };
      }
    } else if (gate.decision !== 'approved') {
      if (gate.decision === 'discard' || gate.decision === 'hold') {
        await this.contentDraftsService.reject(
          String((draft as Record<string, unknown>).id ?? draft._id),
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          gate.reasons.join(' '),
        );
      }

      await this.opportunitiesService.updateStatus(
        ((opportunity as Record<string, unknown>).id as string) ??
          String(opportunity._id),
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        gate.decision === 'hold' ? 'held' : 'discarded',
        { decisionReason: gate.reasons.join(' ') },
      );

      return {
        contentGenerated: 1,
        creditsUsed: opportunity.estimatedCreditCost,
      };
    }

    if (format === 'text' && this.shouldAutoPublish(strategy)) {
      const publishResult = await this.publishTextDraft(
        strategy,
        String((draft as Record<string, unknown>).id ?? draft._id),
        draft.content,
        opportunity.platformCandidates,
        userId,
      );

      if (publishResult.published) {
        await this.opportunitiesService.updateStatus(
          ((opportunity as Record<string, unknown>).id as string) ??
            String(opportunity._id),
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          'published',
          {
            decisionReason:
              'Draft passed publish gate and was converted into pending posts.',
          },
        );
      } else {
        await this.contentDraftsService.approve(
          String((draft as Record<string, unknown>).id ?? draft._id),
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          userId,
        );

        const reviewHandoff = await this.createPublishingInboxHandoff({
          draftContent: draft.content,
          draftId: String((draft as Record<string, unknown>).id ?? draft._id),
          format: this.resolveReviewBatchItemFormat(
            opportunity.platformCandidates[0] ?? strategy.platforms[0],
          ),
          gate,
          opportunity,
          organizationId: String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          platform: opportunity.platformCandidates[0] ?? strategy.platforms[0],
          strategy,
          userId,
        });

        await this.opportunitiesService.updateStatus(
          ((opportunity as Record<string, unknown>).id as string) ??
            String(opportunity._id),
          String(
            (strategy as Record<string, unknown>).organizationId ??
              strategy.organization,
          ),
          'approved',
          {
            decisionReason: reviewHandoff
              ? `Draft passed publish gate but no connected credential was available, so it was handed off to publishing inbox batch ${reviewHandoff.batchId}.`
              : 'Draft passed publish gate but no connected credential was available.',
          },
        );
      }
    } else {
      await this.contentDraftsService.approve(
        String((draft as Record<string, unknown>).id ?? draft._id),
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        userId,
      );

      const reviewHandoff =
        format === 'image'
          ? await this.createPublishingInboxHandoff({
              draftContent: draft.content,
              draftId: String(
                (draft as Record<string, unknown>).id ?? draft._id,
              ),
              format: ContentFormat.IMAGE,
              gate,
              mediaUrl: draft.mediaUrls?.[0],
              opportunity,
              organizationId: String(
                (strategy as Record<string, unknown>).organizationId ??
                  strategy.organization,
              ),
              platform:
                opportunity.platformCandidates[0] ?? strategy.platforms[0],
              strategy,
              userId,
            })
          : format === 'text'
            ? await this.createPublishingInboxHandoff({
                draftContent: draft.content,
                draftId: String(
                  (draft as Record<string, unknown>).id ?? draft._id,
                ),
                format: this.resolveReviewBatchItemFormat(
                  opportunity.platformCandidates[0] ?? strategy.platforms[0],
                ),
                gate,
                opportunity,
                organizationId: String(
                  (strategy as Record<string, unknown>).organizationId ??
                    strategy.organization,
                ),
                platform:
                  opportunity.platformCandidates[0] ?? strategy.platforms[0],
                strategy,
                userId,
              })
            : null;

      await this.opportunitiesService.updateStatus(
        ((opportunity as Record<string, unknown>).id as string) ??
          String(opportunity._id),
        String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        format === 'image' ? 'approved' : 'approved',
        {
          decisionReason:
            format === 'image'
              ? reviewHandoff
                ? `Image passed quality gate and was handed off to publishing inbox batch ${reviewHandoff.batchId}.`
                : 'Image passed quality gate and was approved for downstream review/publishing.'
              : reviewHandoff
                ? `Draft passed publish gate and was handed off to publishing inbox batch ${reviewHandoff.batchId}.`
                : 'Draft passed publish gate and was approved.',
        },
      );
    }

    return {
      contentGenerated: 1,
      creditsUsed: opportunity.estimatedCreditCost,
    };
  }

  private async evaluateDraft(
    strategy: AgentStrategyDocument,
    organizationId: string,
    format: string,
    content: string,
    mediaUrl: string | undefined,
    platform: string,
  ): Promise<PublishGateResult> {
    if (format === 'image') {
      if (!mediaUrl) {
        return {
          decision: 'hold',
          overallScore: 0,
          reasons: ['Image draft has no media URL to evaluate.'],
          revisionInstructions: [],
          scoreBreakdown: {},
        };
      }

      const evaluation = (await this.evaluationsOperationsService.evaluateImage(
        mediaUrl,
        {
          platform,
          prompt: content,
        },
        organizationId,
      )) as Record<string, any>;

      const technicalOverall = Number(
        evaluation?.scores?.technical?.overall ?? evaluation?.overallScore ?? 0,
      );
      const brandOverall = Number(
        evaluation?.scores?.brand?.overall ?? evaluation?.overallScore ?? 0,
      );
      const engagementOverall = Number(
        evaluation?.scores?.engagement?.overall ??
          evaluation?.overallScore ??
          0,
      );
      const overallScore = Number(evaluation?.overallScore ?? 0);

      return {
        decision:
          overallScore >= (strategy.publishPolicy?.minImageScore ?? 75)
            ? 'approved'
            : 'hold',
        overallScore,
        reasons:
          overallScore >= (strategy.publishPolicy?.minImageScore ?? 75)
            ? ['Image cleared the autopilot quality gate.']
            : ['Image quality score did not meet the publish threshold.'],
        revisionInstructions:
          overallScore >= (strategy.publishPolicy?.minImageScore ?? 75)
            ? []
            : [
                'Improve composition and scroll-stop strength.',
                'Increase brand fit and reduce visible generation artifacts.',
              ],
        scoreBreakdown: {
          artifactRisk: technicalOverall,
          brandFit: brandOverall,
          composition: technicalOverall,
          lightingContrast: technicalOverall,
          overlayLegibility: technicalOverall,
          scrollStopStrength: engagementOverall,
        },
      };
    }

    const analysis = await this.optimizersService.analyzeContent(
      {
        content,
        contentType: 'caption',
        goals: ['engagement', 'reach'],
        platform,
      },
      organizationId,
    );

    const hasCTA =
      analysis.metadata?.hasCallToAction ??
      /comment|click|learn more|reply|share|visit/i.test(content);
    const overallScore = Number(analysis.overallScore ?? 0);
    const ctaRequired = strategy.goalProfile === 'reach_traffic';
    const minPostScore = strategy.publishPolicy?.minPostScore ?? 70;
    const reasons: string[] = [];

    if (overallScore < minPostScore) {
      reasons.push('Post quality score fell below the publish threshold.');
    }
    if (ctaRequired && !hasCTA) {
      reasons.push('Reach/traffic mode requires a visible call-to-action.');
    }

    return {
      decision:
        reasons.length === 0
          ? 'approved'
          : overallScore >= Math.max(50, minPostScore - 10)
            ? 'revise'
            : 'discard',
      overallScore,
      reasons:
        reasons.length === 0
          ? [
              'Post cleared the autopilot quality gate.',
              ...(ctaRequired && hasCTA
                ? [
                    'Draft includes a visible call-to-action for traffic intent.',
                  ]
                : []),
            ]
          : reasons,
      revisionInstructions: [
        'Strengthen the opening hook.',
        'Improve clarity and readability.',
        'Add a clear call-to-action aligned to traffic intent.',
      ],
      scoreBreakdown: {
        clarity: Number(analysis.breakdown?.clarity ?? 0),
        hook: Number(analysis.breakdown?.engagement ?? 0),
        platformFit: Number(analysis.breakdown?.platformOptimization ?? 0),
        readability: Number(analysis.breakdown?.readability ?? 0),
      },
    };
  }

  private async createPublishingInboxHandoff(input: {
    draftContent: string;
    draftId: string;
    format: ReviewBatchItemFormat;
    gate: PublishGateResult;
    mediaUrl?: string;
    opportunity: AgentStrategyOpportunityDocument;
    organizationId: string;
    platform?: string;
    strategy: AgentStrategyDocument;
    userId: string;
  }): Promise<{
    batchId: string;
    postId?: string;
    reviewItemId?: string;
  } | null> {
    if (input.format === ContentFormat.IMAGE && !input.mediaUrl) {
      return null;
    }

    const batch = await this.batchGenerationService.createManualReviewBatch(
      {
        brandId: String(input.strategy.brand),
        items: [
          {
            caption: input.draftContent,
            format: input.format,
            gateOverallScore: input.gate.overallScore,
            gateReasons: input.gate.reasons,
            label: `Autopilot ${input.format} review: ${input.opportunity.topic}`,
            mediaUrl: input.mediaUrl,
            opportunitySourceType: input.opportunity.sourceType,
            opportunityTopic: input.opportunity.topic,
            platform: input.platform,
            prompt: input.draftContent,
            sourceActionId: String(
              (input.opportunity as Record<string, unknown>).id ??
                input.opportunity._id,
            ),
            sourceWorkflowId: String(
              (input.strategy as Record<string, unknown>).id ??
                input.strategy._id,
            ),
            sourceWorkflowName: input.strategy.label,
          },
        ],
      },
      input.userId,
      input.organizationId,
    );

    const reviewItem = batch.items[0];

    // TODO: metadata nested field patch — retrieve current then spread when contentDraftsService supports it
    await this.contentDraftsService.patch(input.draftId, {
      metadata: {
        reviewBatchId: batch.id,
        reviewItemId: reviewItem?.id,
        reviewPostId: reviewItem?.postId,
      },
    } as never);

    if (reviewItem?.postId) {
      await this.createPublishingInboxActivity({
        batchId: batch.id,
        format: input.format,
        mediaUrl: input.mediaUrl,
        organizationId: input.organizationId,
        platform: input.platform,
        postId: reviewItem.postId,
        reviewItemId: reviewItem?.id,
        strategy: input.strategy,
        topic: input.opportunity.topic,
        userId: input.userId,
      });
    }

    return {
      batchId: batch.id,
      postId: reviewItem?.postId,
      reviewItemId: reviewItem?.id,
    };
  }

  private resolveReviewBatchItemFormat(
    platform?: string,
  ): ReviewBatchItemFormat {
    const normalizedPlatform = platform?.toLowerCase();

    if (
      normalizedPlatform === 'beehiiv' ||
      normalizedPlatform === 'substack' ||
      normalizedPlatform === 'email'
    ) {
      return 'newsletter';
    }

    return 'post';
  }

  private async createPublishingInboxActivity(input: {
    batchId: string;
    format: ReviewBatchItemFormat;
    mediaUrl?: string;
    organizationId: string;
    platform?: string;
    postId: string;
    reviewItemId?: string;
    strategy: AgentStrategyDocument;
    topic: string;
    userId: string;
  }): Promise<void> {
    const href = `/posts/review?batch=${input.batchId}${
      input.reviewItemId ? `&item=${input.reviewItemId}` : ''
    }`;
    const label = `Autopilot ${input.format} ready for review`;
    const description = `${input.topic} is ready in the publishing inbox.`;

    try {
      await this.activitiesService.create({
        brandId: String(
          (input.strategy as Record<string, unknown>).brandId ??
            input.strategy.brand,
        ),
        entityId: input.postId,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_GENERATED,
        organizationId: input.organizationId,
        source: ActivitySource.POST_GENERATION,
        userId: input.userId,
        value: JSON.stringify({
          batchId: input.batchId,
          description,
          format: input.format,
          href,
          label,
          mediaUrl: input.mediaUrl,
          platform: input.platform,
          resultId: input.postId,
          resultType:
            input.format === ContentFormat.IMAGE
              ? IngredientCategory.IMAGE
              : input.format === ContentFormat.VIDEO
                ? IngredientCategory.VIDEO
                : undefined,
          reviewItemId: input.reviewItemId,
          sentence: description,
          topic: input.topic,
        }),
      } as never);
    } catch (error) {
      this.logger.warn('Failed to create publishing inbox activity', {
        batchId: input.batchId,
        error,
        postId: input.postId,
        reviewItemId: input.reviewItemId,
      });
    }
  }

  private async publishTextDraft(
    strategy: AgentStrategyDocument,
    draftId: string,
    content: string,
    platforms: string[],
    userId: string,
  ): Promise<{ postIds: string[]; published: boolean }> {
    const createdPostIds: string[] = [];

    for (const platform of platforms) {
      const credential = await this.credentialsService.findOne({
        brandId:
          (strategy as Record<string, unknown>).brandId ??
          String(strategy.brand),
        isConnected: true,
        isDeleted: false,
        organizationId:
          (strategy as Record<string, unknown>).organizationId ??
          String(strategy.organization),
        platform,
      });

      if (!credential) {
        continue;
      }

      const post = await this.postsService.create({
        brandId: String(
          (strategy as Record<string, unknown>).brandId ?? strategy.brand,
        ),
        category: PostCategory.TEXT,
        credentialId: String(
          (credential as Record<string, unknown>).id ?? credential._id,
        ),
        description: content,
        organizationId: String(
          (strategy as Record<string, unknown>).organizationId ??
            strategy.organization,
        ),
        platform: credential.platform,
        scheduledDate: new Date(),
        status: PostStatus.PENDING,
        userId: userId,
      } as never);

      createdPostIds.push(
        String((post as Record<string, unknown>).id ?? post._id),
      );
    }

    if (createdPostIds.length > 0) {
      await this.contentDraftsService.patch(draftId, {
        metadata: {
          publishedPostIds: createdPostIds,
        },
        status: ContentDraftStatus.PUBLISHED,
      } as never);
      return {
        postIds: createdPostIds,
        published: true,
      };
    }

    return {
      postIds: [],
      published: false,
    };
  }

  private computeTopicRelevance(
    strategy: AgentStrategyDocument,
    topic: string,
  ): number {
    const loweredTopic = topic.toLowerCase();
    const topics = strategy.topics?.map((item) => item.toLowerCase()) ?? [];
    if (topics.length === 0) {
      return 70;
    }
    if (
      topics.some(
        (item) => loweredTopic.includes(item) || item.includes(loweredTopic),
      )
    ) {
      return 95;
    }
    return 60;
  }

  private computePriorityScore(
    strategy: AgentStrategyDocument,
    scores: {
      costEfficiency: number;
      expectedTraffic: number;
      freshness: number;
      historicalConfidence: number;
      relevance: number;
    },
  ): number {
    const ranking = strategy.rankingPolicy;
    return Number(
      (
        scores.relevance * (ranking?.relevanceWeight ?? 0.3) +
        scores.freshness * (ranking?.freshnessWeight ?? 0.2) +
        scores.expectedTraffic * (ranking?.expectedTrafficWeight ?? 0.2) +
        scores.historicalConfidence *
          (ranking?.historicalConfidenceWeight ?? 0.15) +
        scores.costEfficiency * (ranking?.costEfficiencyWeight ?? 0.15)
      ).toFixed(2),
    );
  }

  private estimateOpportunityCost(formats: string[]): number {
    if (formats.includes('image')) {
      return this.defaultImageOpportunityCost;
    }
    if (formats.includes('video')) {
      return 40;
    }
    return this.defaultTextOpportunityCost;
  }

  private resolveFormatsForStrategy(strategy: AgentStrategyDocument): string[] {
    if (String(strategy.agentType).includes('image')) {
      return ['image'];
    }
    if (String(strategy.agentType).includes('video')) {
      return ['video'];
    }
    if ((strategy.contentMix?.imagePercent ?? 0) > 50) {
      return ['image', 'text'];
    }
    return ['text'];
  }

  private buildImagePrompt(
    strategy: AgentStrategyDocument,
    opportunity: AgentStrategyOpportunityDocument,
  ): string {
    return `Create an on-brand social image for ${strategy.label}. Topic: ${opportunity.topic}. Keep it high contrast, clean, scroll-stopping, and aligned to ${strategy.goalProfile}.`;
  }

  private shouldAutoPublish(strategy: AgentStrategyDocument): boolean {
    return (
      strategy.autonomyMode === 'auto_publish' &&
      Boolean(strategy.publishPolicy?.autoPublishEnabled)
    );
  }

  private resolveReportWindow(reportType: AgentStrategyReportType): {
    periodEnd: Date;
    periodStart: Date;
  } {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(
      periodStart.getUTCDate() - (reportType === 'weekly' ? 7 : 1),
    );

    return { periodEnd, periodStart };
  }
}
