import { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import {
  type AnalyticsBestPostingTime,
  AnalyticsService,
} from '@api/endpoints/analytics/analytics.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CampaignMemoryQueueService } from '@api/services/agent-campaign/campaign-memory-queue.service';
import {
  DEFAULT_ORCHESTRATION_INTERVAL_HOURS,
  MAX_ORCHESTRATED_STRATEGIES_PER_RUN,
} from '@api/services/agent-campaign/orchestrator.constants';
import { OrchestratorQueueService } from '@api/services/agent-campaign/orchestrator-queue.service';
import { isOrchestratorAgentType } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import {
  AgentExecutionTrigger,
  type AgentType,
  AnalyticsMetric,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

interface AnalyticsOverview {
  avgEngagementRate?: number;
  engagementGrowth?: number;
  postsGrowth?: number;
  totalComments?: number;
  totalEngagement?: number;
  totalLikes?: number;
  totalPosts?: number;
  totalSaves?: number;
  totalShares?: number;
  totalViews?: number;
  viewsGrowth?: number;
}

interface TopContentEntry {
  date?: Date | string;
  description?: string;
  engagementRate?: number;
  isVideo?: boolean;
  label?: string;
  platform?: string;
  totalEngagement?: number;
  totalViews?: number;
}

interface OrchestrationDispatchPlan {
  agentType: AgentType;
  objective: string;
  reason: string;
  runId: string;
  strategyId: string;
}

export type TriggerDispatchType =
  | 'performance_dip'
  | 'trend_spike'
  | 'viral_post';

export type TriggeredCampaignDispatchInput = {
  campaignId: string;
  contentMixSummary?: string | null;
  organizationId: string;
  postingRecommendations: AnalyticsBestPostingTime[];
  strategies: AgentStrategyDocument[];
  triggerContextLines: string[];
  triggerMetadata: Record<string, string | number | boolean | null>;
  triggerSummary: string;
  triggerType: TriggerDispatchType;
};

export interface ContentEngineCycleResult {
  campaignId: string;
  dispatchCount: number;
  dispatchedRuns: OrchestrationDispatchPlan[];
  nextOrchestratedAt: Date | null;
  skippedReason?: string;
  summary: string;
}

export interface CampaignWinnerExtractionResult {
  campaignId: string;
  extractedCount: number;
  memoryId?: string;
  skippedReason?: string;
  summary: string;
}

@Injectable()
export class ContentEngineService {
  private readonly logContext = 'CampaignContentEngineService';

  constructor(
    private readonly agentCampaignsService: AgentCampaignsService,
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly agentGoalsService: AgentGoalsService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly analyticsService: AnalyticsService,
    private readonly agentMemoryCaptureService: AgentMemoryCaptureService,
    private readonly campaignMemoryQueueService: CampaignMemoryQueueService,
    private readonly orchestratorQueueService: OrchestratorQueueService,
    private readonly logger: LoggerService,
  ) {}

  async runOrchestrationCycle(
    campaignId: string,
    organizationId: string,
  ): Promise<ContentEngineCycleResult> {
    const campaign = await this.agentCampaignsService.findOne({
      _id: new Types.ObjectId(campaignId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    if (campaign.status !== 'active') {
      return await this.finalizeCycle(campaign, {
        dispatchedRuns: [],
        nextOrchestratedAt: null,
        skippedReason: `Campaign is ${campaign.status}, skipping orchestration.`,
        summary: `Skipped orchestration because campaign status is ${campaign.status}.`,
      });
    }

    if (campaign.orchestrationEnabled === false) {
      return await this.finalizeCycle(campaign, {
        dispatchedRuns: [],
        nextOrchestratedAt: null,
        skippedReason: 'Campaign orchestration is disabled.',
        summary:
          'Skipped orchestration because campaign orchestration is disabled.',
      });
    }

    const userId = String(campaign.user);
    const strategies = await this.loadCampaignStrategies(
      campaign,
      organizationId,
    );
    const dispatchableStrategies = strategies
      .filter((strategy) => strategy.isEnabled !== false)
      .filter((strategy) => !isOrchestratorAgentType(strategy.agentType))
      .slice(0, MAX_ORCHESTRATED_STRATEGIES_PER_RUN);

    if (dispatchableStrategies.length === 0) {
      return await this.finalizeCycle(campaign, {
        dispatchedRuns: [],
        nextOrchestratedAt: this.computeNextRunAt(campaign, new Date()),
        skippedReason:
          'No non-orchestrator campaign strategies are eligible to dispatch.',
        summary:
          'Skipped orchestration because the campaign has no eligible specialist strategies.',
      });
    }

    const goalSummaries = await this.loadGoalSummaries(
      dispatchableStrategies,
      organizationId,
    );
    const analyticsOverview = await this.loadAnalyticsOverview(campaign);
    const remainingCampaignBudget = this.getRemainingCampaignBudget(campaign);

    if (remainingCampaignBudget !== null && remainingCampaignBudget <= 0) {
      await this.agentCampaignsService.patch(campaignId, {
        lastOrchestrationSummary:
          'Campaign budget exhausted before orchestration dispatch.',
        nextOrchestratedAt: null,
        status: 'completed',
      } as Record<string, unknown>);

      return await this.finalizeCycle(campaign, {
        dispatchedRuns: [],
        nextOrchestratedAt: null,
        skippedReason: 'Campaign credit budget is exhausted.',
        summary:
          'Skipped orchestration and completed the campaign because the credit budget is exhausted.',
      });
    }

    const perStrategyBudget =
      remainingCampaignBudget !== null
        ? Math.max(
            1,
            Math.floor(remainingCampaignBudget / dispatchableStrategies.length),
          )
        : null;

    const dispatchedRuns: OrchestrationDispatchPlan[] = [];
    const runRecords: AgentRunDocument[] = [];

    for (const strategy of dispatchableStrategies) {
      const reason = this.buildDispatchReason(strategy, analyticsOverview);
      const objective = this.buildDispatchObjective(
        campaign,
        strategy,
        goalSummaries,
        analyticsOverview,
      );
      const creditBudget =
        perStrategyBudget !== null
          ? Math.min(
              strategy.dailyCreditBudget || perStrategyBudget,
              perStrategyBudget,
            )
          : strategy.dailyCreditBudget || undefined;

      const run = await this.agentRunsService.create({
        creditBudget,
        label: `Campaign orchestrator: ${campaign.label} -> ${strategy.label}`,
        metadata: {
          campaignId,
          dispatchedBy: 'campaign_orchestrator',
          dispatchedStrategyId: String(strategy._id),
          reason,
        },
        objective,
        organization: new Types.ObjectId(organizationId),
        strategy: new Types.ObjectId(String(strategy._id)),
        trigger: AgentExecutionTrigger.CRON,
        user: new Types.ObjectId(userId),
      });

      runRecords.push(run);

      await this.agentRunQueueService.queueRun({
        agentType: strategy.agentType,
        autonomyMode: strategy.autonomyMode,
        campaignId,
        creditBudget,
        model: strategy.model,
        objective,
        organizationId,
        runId: String(run._id),
        strategyId: String(strategy._id),
        userId,
      });

      dispatchedRuns.push({
        agentType: strategy.agentType,
        objective,
        reason,
        runId: String(run._id),
        strategyId: String(strategy._id),
      });
    }

    for (const plan of dispatchedRuns) {
      await this.agentRunsService.mergeMetadata(plan.runId, organizationId, {
        campaignId,
        orchestrationDispatchReason: plan.reason,
      });
    }

    const nextOrchestratedAt = this.computeNextRunAt(campaign, new Date());
    const summary = this.buildCycleSummary(
      campaign,
      dispatchedRuns,
      analyticsOverview,
      goalSummaries,
    );

    await this.captureDecisionMemory(
      campaign,
      analyticsOverview,
      dispatchedRuns,
      goalSummaries,
      summary,
    );

    for (const run of runRecords) {
      await this.agentRunsService.patch(String(run._id), {
        metadata: {
          ...(run.metadata ?? {}),
          campaignId,
          orchestrationSummary: summary,
        },
      } as Record<string, unknown>);
    }

    for (const plan of dispatchedRuns) {
      await this.agentRunsService.patch(plan.runId, {
        metadata: {
          campaignId,
          orchestrationDispatchReason: plan.reason,
          orchestrationSummary: summary,
        },
      } as Record<string, unknown>);
    }

    return await this.finalizeCycle(campaign, {
      dispatchedRuns,
      nextOrchestratedAt,
      summary,
    });
  }

  async dispatchTriggeredRuns(
    input: TriggeredCampaignDispatchInput,
  ): Promise<ContentEngineCycleResult> {
    const campaign = await this.agentCampaignsService.findOneById(
      input.campaignId,
      input.organizationId,
    );

    if (!campaign) {
      throw new NotFoundException(
        `Campaign ${input.campaignId} not found in organization ${input.organizationId}`,
      );
    }

    if (campaign.status !== 'active') {
      return {
        campaignId: input.campaignId,
        dispatchCount: 0,
        dispatchedRuns: [],
        nextOrchestratedAt: campaign.nextOrchestratedAt ?? null,
        skippedReason: `Campaign is ${campaign.status}, skipping trigger dispatch.`,
        summary: `Skipped trigger dispatch because campaign status is ${campaign.status}.`,
      };
    }

    if (input.strategies.length === 0) {
      return {
        campaignId: input.campaignId,
        dispatchCount: 0,
        dispatchedRuns: [],
        nextOrchestratedAt: campaign.nextOrchestratedAt ?? null,
        skippedReason: 'No strategies selected for trigger dispatch.',
        summary:
          'Skipped trigger dispatch because no strategies were selected.',
      };
    }

    const organizationId = String(campaign.organization);
    const userId = String(campaign.user);
    const goalSummaries = await this.loadGoalSummaries(
      input.strategies,
      organizationId,
    );
    const analyticsOverview = await this.loadAnalyticsOverview(campaign);
    const remainingCampaignBudget = this.getRemainingCampaignBudget(campaign);

    if (remainingCampaignBudget !== null && remainingCampaignBudget <= 0) {
      return {
        campaignId: input.campaignId,
        dispatchCount: 0,
        dispatchedRuns: [],
        nextOrchestratedAt: campaign.nextOrchestratedAt ?? null,
        skippedReason: 'Campaign credit budget is exhausted.',
        summary:
          'Skipped trigger dispatch because the campaign budget is exhausted.',
      };
    }

    const perStrategyBudget =
      remainingCampaignBudget !== null
        ? Math.max(
            1,
            Math.floor(remainingCampaignBudget / input.strategies.length),
          )
        : null;

    const dispatchedRuns: OrchestrationDispatchPlan[] = [];

    for (const strategy of input.strategies) {
      const reason = `[${input.triggerType}] ${input.triggerSummary}`;
      const objective = this.buildTriggerDispatchObjective(
        campaign,
        strategy,
        goalSummaries,
        analyticsOverview,
        input,
      );
      const creditBudget =
        perStrategyBudget !== null
          ? Math.min(
              strategy.dailyCreditBudget || perStrategyBudget,
              perStrategyBudget,
            )
          : strategy.dailyCreditBudget || undefined;

      const run = await this.agentRunsService.create({
        creditBudget,
        label: `Campaign trigger: ${campaign.label} -> ${strategy.label}`,
        metadata: {
          campaignId: input.campaignId,
          dispatchedBy: 'campaign_trigger_evaluator',
          dispatchedStrategyId: String(strategy._id),
          triggerMetadata: input.triggerMetadata,
          triggerType: input.triggerType,
        },
        objective,
        organization: campaign.organization,
        strategy: strategy._id as unknown as Types.ObjectId,
        trigger: AgentExecutionTrigger.CRON,
        user: campaign.user,
      });

      await this.agentRunQueueService.queueRun({
        agentType: strategy.agentType,
        autonomyMode: strategy.autonomyMode,
        campaignId: input.campaignId,
        creditBudget,
        model: strategy.model,
        objective,
        organizationId,
        runId: String(run._id),
        strategyId: String(strategy._id),
        userId,
      });

      dispatchedRuns.push({
        agentType: strategy.agentType,
        objective,
        reason,
        runId: String(run._id),
        strategyId: String(strategy._id),
      });
    }

    for (const dispatch of dispatchedRuns) {
      await this.agentRunsService.mergeMetadata(
        dispatch.runId,
        organizationId,
        {
          campaignId: input.campaignId,
          triggerMetadata: input.triggerMetadata,
          triggerType: input.triggerType,
        },
      );

      await this.agentRunsService.patch(dispatch.runId, {
        metadata: {
          campaignId: input.campaignId,
          orchestrationDispatchReason: dispatch.reason,
          triggerMetadata: input.triggerMetadata,
          triggerType: input.triggerType,
        },
      } as Record<string, unknown>);
    }

    this.logger.log(`${this.logContext} dispatched trigger-driven runs`, {
      campaignId: input.campaignId,
      dispatchCount: dispatchedRuns.length,
      triggerType: input.triggerType,
    });

    return {
      campaignId: input.campaignId,
      dispatchCount: dispatchedRuns.length,
      dispatchedRuns,
      nextOrchestratedAt: campaign.nextOrchestratedAt ?? null,
      summary: `Dispatched ${dispatchedRuns.length} run(s) for ${input.triggerType}.`,
    };
  }

  private async loadCampaignStrategies(
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

    return strategies.filter(
      (strategy): strategy is AgentStrategyDocument => strategy !== null,
    );
  }

  private async loadGoalSummaries(
    strategies: AgentStrategyDocument[],
    organizationId: string,
  ): Promise<string[]> {
    const goalIds = [
      ...new Set(
        strategies
          .map((strategy) => strategy.goalId)
          .filter((goalId): goalId is Types.ObjectId => Boolean(goalId))
          .map((goalId) => String(goalId)),
      ),
    ];

    const summaries = await Promise.allSettled(
      goalIds.map((goalId) =>
        this.agentGoalsService.getGoalSummary(goalId, organizationId),
      ),
    );

    return summaries
      .filter(
        (result): result is PromiseFulfilledResult<string> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);
  }

  private async loadAnalyticsOverview(
    campaign: AgentCampaignDocument,
  ): Promise<AnalyticsOverview> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    const overview = await this.analyticsService.getOverview(
      sevenDaysAgo.toISOString(),
      now.toISOString(),
      campaign.brand ? String(campaign.brand) : undefined,
      String(campaign.organization),
    );

    return (overview ?? {}) as AnalyticsOverview;
  }

  private getRemainingCampaignBudget(
    campaign: AgentCampaignDocument,
  ): number | null {
    if (!campaign.creditsAllocated || campaign.creditsAllocated <= 0) {
      return null;
    }

    return campaign.creditsAllocated - (campaign.creditsUsed || 0);
  }

  private buildDispatchReason(
    strategy: AgentStrategyDocument,
    analyticsOverview: AnalyticsOverview,
  ): string {
    const engagementRate = Number(
      analyticsOverview.avgEngagementRate ?? 0,
    ).toFixed(2);
    const totalViews = Math.round(analyticsOverview.totalViews ?? 0);
    const topics =
      strategy.topics.length > 0
        ? strategy.topics.join(', ')
        : 'campaign priorities';

    return `${strategy.label} is aligned to ${topics} with recent campaign engagement at ${engagementRate}% and ${totalViews} views over the last 7 days.`;
  }

  private buildDispatchObjective(
    campaign: AgentCampaignDocument,
    strategy: AgentStrategyDocument,
    goalSummaries: string[],
    analyticsOverview: AnalyticsOverview,
  ): string {
    const lines = [
      `Campaign: ${campaign.label}`,
      `Campaign brief: ${campaign.brief || 'No campaign brief provided.'}`,
      `Strategy: ${strategy.label}`,
      `Role: ${strategy.displayRole || strategy.agentType}`,
      `Topics: ${strategy.topics.join(', ') || 'No topics configured.'}`,
      `Recent 7-day analytics: ${Math.round(analyticsOverview.totalViews ?? 0)} views, ${Math.round(analyticsOverview.totalPosts ?? 0)} tracked posts, ${(analyticsOverview.avgEngagementRate ?? 0).toFixed(2)}% average engagement.`,
    ];

    if (goalSummaries.length > 0) {
      lines.push(`Goals:\n- ${goalSummaries.join('\n- ')}`);
    }

    lines.push(
      'Decide and execute the single highest leverage content task for this campaign right now. Stay within the campaign brief, use the recent analytics as guidance, and optimize for measurable progress against the listed goals.',
    );

    return lines.join('\n\n');
  }

  private buildTriggerDispatchObjective(
    campaign: AgentCampaignDocument,
    strategy: AgentStrategyDocument,
    goalSummaries: string[],
    analyticsOverview: AnalyticsOverview,
    input: TriggeredCampaignDispatchInput,
  ): string {
    const recommendedPostingTimes = input.postingRecommendations
      .filter((recommendation) =>
        strategy.platforms.length > 0
          ? strategy.platforms.includes(recommendation.platform)
          : true,
      )
      .map(
        (recommendation) =>
          `${recommendation.platform} @ ${String(recommendation.hour).padStart(2, '0')}:00 (${recommendation.avgEngagementRate.toFixed(2)}% avg engagement across ${recommendation.postCount} post(s))`,
      );

    const lines = [
      `Campaign: ${campaign.label}`,
      `Campaign brief: ${campaign.brief || 'No campaign brief provided.'}`,
      `Strategy: ${strategy.label}`,
      `Role: ${strategy.displayRole || strategy.agentType}`,
      `Trigger type: ${input.triggerType}`,
      `Trigger summary: ${input.triggerSummary}`,
      `Recent 7-day analytics: ${Math.round(analyticsOverview.totalViews ?? 0)} views, ${Math.round(analyticsOverview.totalPosts ?? 0)} tracked posts, ${(analyticsOverview.avgEngagementRate ?? 0).toFixed(2)}% average engagement.`,
      input.triggerContextLines.length > 0
        ? `Trigger evidence:\n- ${input.triggerContextLines.join('\n- ')}`
        : '',
      recommendedPostingTimes.length > 0
        ? `Recommended posting windows:\n- ${recommendedPostingTimes.join('\n- ')}`
        : '',
      input.contentMixSummary || '',
    ].filter(Boolean);

    if (goalSummaries.length > 0) {
      lines.push(`Goals:\n- ${goalSummaries.join('\n- ')}`);
    }

    lines.push(
      'React to the trigger immediately with the single highest-leverage action for this strategy. Use the trigger evidence, respect the suggested posting windows, and keep the response aligned to the campaign brief.',
    );

    return lines.join('\n\n');
  }

  private buildCycleSummary(
    campaign: AgentCampaignDocument,
    dispatchedRuns: OrchestrationDispatchPlan[],
    analyticsOverview: AnalyticsOverview,
    goalSummaries: string[],
  ): string {
    const dispatchLines = dispatchedRuns.map(
      (dispatch) =>
        `- ${dispatch.agentType} via strategy ${dispatch.strategyId}: ${dispatch.reason}`,
    );

    const goalSection =
      goalSummaries.length > 0
        ? `Goals:\n- ${goalSummaries.join('\n- ')}\n\n`
        : '';

    return [
      `Campaign ${campaign.label} dispatched ${dispatchedRuns.length} specialist run(s).`,
      '',
      `Recent analytics: ${Math.round(analyticsOverview.totalViews ?? 0)} views, ${Math.round(analyticsOverview.totalPosts ?? 0)} posts, ${(analyticsOverview.avgEngagementRate ?? 0).toFixed(2)}% average engagement.`,
      '',
      goalSection,
      'Dispatch decisions:',
      ...dispatchLines,
    ].join('\n');
  }

  private async captureDecisionMemory(
    campaign: AgentCampaignDocument,
    analyticsOverview: AnalyticsOverview,
    dispatchedRuns: OrchestrationDispatchPlan[],
    goalSummaries: string[],
    summary: string,
  ): Promise<void> {
    await this.agentMemoryCaptureService.capture(
      String(campaign.user),
      String(campaign.organization),
      {
        brandId: campaign.brand ? String(campaign.brand) : undefined,
        campaignId: String(campaign._id),
        confidence: 0.7,
        content: summary,
        contentType: 'generic',
        importance: 0.8,
        kind: 'pattern',
        performanceSnapshot: {
          avgEngagementRate: analyticsOverview.avgEngagementRate ?? 0,
          dispatchCount: dispatchedRuns.length,
          totalPosts: analyticsOverview.totalPosts ?? 0,
          totalViews: analyticsOverview.totalViews ?? 0,
        },
        scope: 'campaign',
        sourceContentId: String(campaign._id),
        sourceType: 'campaign-orchestrator',
        summary: goalSummaries.length
          ? `Campaign orchestrator dispatched ${dispatchedRuns.length} runs against ${goalSummaries.length} active goal signal(s).`
          : `Campaign orchestrator dispatched ${dispatchedRuns.length} runs.`,
        tags: [`campaign:${String(campaign._id)}`, 'orchestrator', 'campaign'],
      },
    );
  }

  private computeNextRunAt(campaign: AgentCampaignDocument, from: Date): Date {
    const intervalHours =
      campaign.orchestrationIntervalHours ||
      DEFAULT_ORCHESTRATION_INTERVAL_HOURS;

    return new Date(from.getTime() + intervalHours * 60 * 60 * 1000);
  }

  private async finalizeCycle(
    campaign: AgentCampaignDocument,
    input: {
      dispatchedRuns: OrchestrationDispatchPlan[];
      nextOrchestratedAt: Date | null;
      skippedReason?: string;
      summary: string;
    },
  ): Promise<ContentEngineCycleResult> {
    const now = new Date();

    await this.agentCampaignsService.patch(String(campaign._id), {
      lastOrchestratedAt: now,
      lastOrchestrationSummary: input.summary,
      nextOrchestratedAt: input.nextOrchestratedAt,
    } as Record<string, unknown>);

    this.logger.log(`${this.logContext} finalized orchestration cycle`, {
      campaignId: String(campaign._id),
      dispatchCount: input.dispatchedRuns.length,
      nextOrchestratedAt: input.nextOrchestratedAt?.toISOString(),
      skippedReason: input.skippedReason,
    });

    return {
      campaignId: String(campaign._id),
      dispatchCount: input.dispatchedRuns.length,
      dispatchedRuns: input.dispatchedRuns,
      nextOrchestratedAt: input.nextOrchestratedAt,
      skippedReason: input.skippedReason,
      summary: input.summary,
    };
  }

  async scheduleCampaign(
    campaignId: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const jobId = await this.orchestratorQueueService.queueCampaignRun({
      campaignId,
      organizationId,
      userId,
    });

    await this.campaignMemoryQueueService.queueExtraction({
      campaignId,
      organizationId,
      userId,
    });

    return jobId;
  }

  async extractWinnerPatterns(
    campaignId: string,
    organizationId: string,
  ): Promise<CampaignWinnerExtractionResult> {
    const campaign = await this.agentCampaignsService.findOne({
      _id: new Types.ObjectId(campaignId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    if (campaign.status !== 'active') {
      return {
        campaignId,
        extractedCount: 0,
        skippedReason: `Campaign is ${campaign.status}, skipping winner extraction.`,
        summary: `Skipped winner extraction because campaign status is ${campaign.status}.`,
      };
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const topContent = (await this.analyticsService.getTopContent(
      startDate.toISOString(),
      now.toISOString(),
      5,
      AnalyticsMetric.ENGAGEMENT,
      campaign.brand ? String(campaign.brand) : undefined,
      undefined,
      String(campaign.organization),
    )) as TopContentEntry[];

    if (topContent.length === 0) {
      return {
        campaignId,
        extractedCount: 0,
        skippedReason:
          'No top-performing content found for this campaign window.',
        summary:
          'Skipped winner extraction because no top-performing content was available for the last 30 days.',
      };
    }

    const patternSummary = this.buildWinnerPatternSummary(topContent);
    const topLabels = topContent
      .map((entry) => entry.label?.trim())
      .filter((label): label is string => Boolean(label))
      .slice(0, 3);
    const avgViews =
      topContent.reduce((sum, entry) => sum + (entry.totalViews ?? 0), 0) /
      topContent.length;
    const avgEngagementRate =
      topContent.reduce((sum, entry) => sum + (entry.engagementRate ?? 0), 0) /
      topContent.length;

    const content = [
      `Top-performing campaign content in the last 30 days clusters around ${patternSummary.format} on ${patternSummary.platform}.`,
      `The dominant tone is ${patternSummary.tone} and the best posting window is ${patternSummary.daypart}.`,
      topLabels.length > 0
        ? `Representative winners: ${topLabels.join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const capture = await this.agentMemoryCaptureService.capture(
      String(campaign.user),
      String(campaign.organization),
      {
        brandId: campaign.brand ? String(campaign.brand) : undefined,
        campaignId,
        confidence: 0.75,
        content,
        contentType: patternSummary.contentType,
        importance: 0.85,
        kind: 'winner',
        performanceSnapshot: {
          averageEngagementRate: Number(avgEngagementRate.toFixed(2)),
          averageViews: Math.round(avgViews),
          dominantDaypart: patternSummary.daypart,
          dominantFormat: patternSummary.format,
          dominantPlatform: patternSummary.platform,
          dominantTone: patternSummary.tone,
          sampleSize: topContent.length,
        },
        scope: 'campaign',
        sourceContentId: String(campaign._id),
        sourceType: 'campaign-winner-extraction',
        summary: `Winner pattern extracted from ${topContent.length} top-performing post(s).`,
        tags: [
          `campaign:${String(campaign._id)}`,
          `daypart:${patternSummary.daypart}`,
          `format:${patternSummary.format}`,
          `platform:${patternSummary.platform}`,
          `tone:${patternSummary.tone}`,
          'winner-extraction',
        ],
      },
    );

    const summary = `Extracted campaign winner pattern from ${topContent.length} top-performing post(s): ${patternSummary.format} on ${patternSummary.platform}, ${patternSummary.tone} tone, ${patternSummary.daypart} posting window.`;

    this.logger.log(`${this.logContext} extracted winner pattern`, {
      campaignId,
      memoryId: String(capture.memory._id),
      summary,
    });

    return {
      campaignId,
      extractedCount: topContent.length,
      memoryId: String(capture.memory._id),
      summary,
    };
  }

  private buildWinnerPatternSummary(topContent: TopContentEntry[]): {
    contentType: 'article' | 'generic' | 'post';
    daypart: string;
    format: string;
    platform: string;
    tone: string;
  } {
    const platform = this.pickMostFrequent(
      topContent
        .map((entry) => entry.platform?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
      'unknown-platform',
    );
    const daypart = this.pickMostFrequent(
      topContent.map((entry) => this.resolveDaypart(entry.date)),
      'unknown-time',
    );
    const tone = this.pickMostFrequent(
      topContent.map((entry) => this.resolveTone(entry.description)),
      'neutral',
    );

    const videoCount = topContent.filter((entry) => entry.isVideo).length;
    const format =
      videoCount >= Math.ceil(topContent.length / 2) ? 'video' : 'post';

    return {
      contentType: format === 'video' ? 'post' : 'generic',
      daypart,
      format,
      platform,
      tone,
    };
  }

  private pickMostFrequent(values: string[], fallback: string): string {
    if (values.length === 0) {
      return fallback;
    }

    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return (
      Array.from(counts.entries()).sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0]);
      })[0]?.[0] ?? fallback
    );
  }

  private resolveDaypart(dateValue?: Date | string): string {
    if (!dateValue) {
      return 'unknown-time';
    }

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return 'unknown-time';
    }

    const hour = parsed.getUTCHours();
    if (hour < 6) {
      return 'late-night';
    }

    if (hour < 12) {
      return 'morning';
    }

    if (hour < 18) {
      return 'afternoon';
    }

    return 'evening';
  }

  private resolveTone(description?: string): string {
    const normalized = description?.trim().toLowerCase() ?? '';
    if (!normalized) {
      return 'neutral';
    }

    if (normalized.includes('?')) {
      return 'question-led';
    }

    if (
      normalized.includes('how to') ||
      normalized.includes('tips') ||
      normalized.includes('guide')
    ) {
      return 'educational';
    }

    if (
      normalized.includes('i ') ||
      normalized.includes('we ') ||
      normalized.includes('my ')
    ) {
      return 'storytelling';
    }

    if (
      normalized.includes('buy') ||
      normalized.includes('sale') ||
      normalized.includes('offer')
    ) {
      return 'promotional';
    }

    if (normalized.includes('you')) {
      return 'conversational';
    }

    return 'directive';
  }
}
