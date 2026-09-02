import { type AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { type AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import {
  type AnalyticsBestPostingTime,
  AnalyticsService,
} from '@api/endpoints/analytics/analytics.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import {
  type ContentRotationSelection,
  ContentRotationService,
} from '@api/services/agent-campaign/content-rotation.service';
import {
  DEFAULT_ORCHESTRATION_INTERVAL_HOURS,
  MAX_ORCHESTRATED_STRATEGIES_PER_RUN,
} from '@api/services/agent-campaign/orchestrator.constants';
import { isOrchestratorAgentType } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { AgentRuntimeService } from '@api/services/agent-runtime/agent-runtime.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import type { AgentType } from '@genfeedai/enums';
import type { IAgentCampaignContentRotation } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable } from '@nestjs/common';

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

export interface OrchestrationDispatchPlan {
  agentType: AgentType;
  executionId: string;
  objective: string;
  reason: string;
  strategyId: string;
}

export type CampaignOrchestrationDispatchItem = {
  campaign: AgentCampaignDocument;
  creditBudget?: number;
  objective: string;
  organizationId: string;
  reason: string;
  rotationSelection?: ContentRotationSelection;
  strategy: AgentStrategyDocument;
  userId: string;
};

export type CampaignOrchestrationState = {
  analyticsOverview: AnalyticsOverview;
  campaign: AgentCampaignDocument;
  completeCampaign?: boolean;
  dispatchedRuns?: OrchestrationDispatchPlan[];
  goalSummaries: string[];
  items?: CampaignOrchestrationDispatchItem[];
  memoryCaptured?: boolean;
  nextOrchestratedAt?: string | null;
  organizationId: string;
  perStrategyBudget: number | null;
  rotationSelection?: ContentRotationSelection;
  selectedStrategies: AgentStrategyDocument[];
  skippedReason?: string;
  summary?: string;
};

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

export type TriggeredCampaignDispatchItem = {
  campaign: AgentCampaignDocument;
  creditBudget?: number;
  input: TriggeredCampaignDispatchInput;
  objective: string;
  reason: string;
  strategy: AgentStrategyDocument;
  userId: string;
};

export type TriggeredCampaignDispatchState = {
  campaign: AgentCampaignDocument;
  input: TriggeredCampaignDispatchInput;
  items: TriggeredCampaignDispatchItem[];
  nextOrchestratedAt: string | null;
  skippedReason?: string;
  summary?: string;
};

export interface ContentEngineCycleResult {
  campaignId: string;
  dispatchCount: number;
  dispatchedRuns: OrchestrationDispatchPlan[];
  nextOrchestratedAt: string | null;
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
    private readonly prisma: PrismaService,
    private readonly contentRotationService: ContentRotationService,
    private readonly analyticsService: AnalyticsService,
    private readonly agentMemoryCaptureService: AgentMemoryCaptureService,
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => AgentRuntimeService))
    private readonly agentRuntimeService: AgentRuntimeService,
  ) {}

  private requireAgentType(
    agentType: AgentStrategyDocument['agentType'],
  ): AgentType {
    if (!agentType) {
      throw new Error('Agent strategy type is missing');
    }

    return agentType as AgentType;
  }

  private normalizeModel(model: string | null | undefined): string | undefined {
    return model ?? undefined;
  }

  private normalizeDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  private getStrategyTopics(strategy: AgentStrategyDocument): string[] {
    return strategy.topics ?? [];
  }

  private getStrategyPlatforms(strategy: AgentStrategyDocument): string[] {
    return strategy.platforms ?? [];
  }

  async loadOrchestrationContext(
    campaignId: string,
    organizationId: string,
  ): Promise<CampaignOrchestrationState> {
    const campaign = await this.agentCampaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (!campaign) {
      throw new NotFoundException('Campaign', campaignId);
    }

    if (campaign.status !== 'active') {
      return {
        analyticsOverview: {},
        campaign,
        goalSummaries: [],
        nextOrchestratedAt: null,
        organizationId,
        perStrategyBudget: null,
        selectedStrategies: [],
        skippedReason: `Campaign is ${campaign.status}, skipping orchestration.`,
        summary: `Skipped orchestration because campaign status is ${campaign.status}.`,
      };
    }

    if (campaign.orchestrationEnabled === false) {
      return {
        analyticsOverview: {},
        campaign,
        goalSummaries: [],
        nextOrchestratedAt: null,
        organizationId,
        perStrategyBudget: null,
        selectedStrategies: [],
        skippedReason: 'Campaign orchestration is disabled.',
        summary:
          'Skipped orchestration because campaign orchestration is disabled.',
      };
    }

    const strategies = await this.loadCampaignStrategies(
      campaign,
      organizationId,
    );
    const dispatchableStrategies = strategies
      .filter((strategy) => strategy.isEnabled !== false)
      .filter((strategy) => !isOrchestratorAgentType(strategy.agentType));

    if (dispatchableStrategies.length === 0) {
      return {
        analyticsOverview: {},
        campaign,
        goalSummaries: [],
        nextOrchestratedAt: this.computeNextRunAt(
          campaign,
          new Date(),
        ).toISOString(),
        organizationId,
        perStrategyBudget: null,
        selectedStrategies: [],
        skippedReason:
          'No non-orchestrator campaign strategies are eligible to dispatch.',
        summary:
          'Skipped orchestration because the campaign has no eligible specialist strategies.',
      };
    }

    const contentRotation = this.getCampaignContentRotation(campaign);
    const recentRotationRuns = contentRotation
      ? await this.loadRecentRotationRuns(
          campaign,
          organizationId,
          contentRotation,
        )
      : [];
    const rotationResult = this.contentRotationService.selectStrategies({
      config: contentRotation,
      recentRuns: recentRotationRuns,
      strategies: dispatchableStrategies,
    });
    const selectedStrategies = rotationResult.selectedStrategies.slice(
      0,
      MAX_ORCHESTRATED_STRATEGIES_PER_RUN,
    );
    const goalSummaries = await this.loadGoalSummaries(
      selectedStrategies,
      organizationId,
    );
    const analyticsOverview = await this.loadAnalyticsOverview(campaign);
    const remainingCampaignBudget = this.getRemainingCampaignBudget(campaign);

    if (remainingCampaignBudget !== null && remainingCampaignBudget <= 0) {
      return {
        analyticsOverview,
        campaign,
        completeCampaign: true,
        goalSummaries,
        nextOrchestratedAt: null,
        organizationId,
        perStrategyBudget: null,
        rotationSelection: rotationResult.selection,
        selectedStrategies: [],
        skippedReason: 'Campaign credit budget is exhausted.',
        summary:
          'Skipped orchestration and completed the campaign because the credit budget is exhausted.',
      };
    }

    const perStrategyBudget =
      remainingCampaignBudget !== null
        ? Math.max(
            1,
            Math.floor(remainingCampaignBudget / selectedStrategies.length),
          )
        : null;

    return {
      analyticsOverview,
      campaign,
      goalSummaries,
      organizationId,
      perStrategyBudget,
      rotationSelection: rotationResult.selection,
      selectedStrategies,
    };
  }

  planOrchestrationDispatches(
    state: CampaignOrchestrationState,
  ): CampaignOrchestrationState & {
    items: CampaignOrchestrationDispatchItem[];
  } {
    if (state.skippedReason) {
      return { ...state, items: [] };
    }
    const campaignId = String(state.campaign.id);
    const userId = this.requireCampaignUserId(state.campaign, campaignId);
    const items = state.selectedStrategies.map((strategy) => {
      const reason = this.buildDispatchReason(
        strategy,
        state.analyticsOverview,
        state.rotationSelection,
      );
      const objective = this.buildDispatchObjective(
        state.campaign,
        strategy,
        state.goalSummaries,
        state.analyticsOverview,
        state.rotationSelection,
      );
      const creditBudget =
        state.perStrategyBudget !== null
          ? Math.min(
              strategy.dailyCreditBudget || state.perStrategyBudget,
              state.perStrategyBudget,
            )
          : strategy.dailyCreditBudget || undefined;
      return {
        campaign: state.campaign,
        creditBudget,
        objective,
        organizationId: state.organizationId,
        reason,
        rotationSelection: state.rotationSelection,
        strategy,
        userId,
      };
    });
    return { ...state, items };
  }

  async dispatchOrchestrationItem(
    item: CampaignOrchestrationDispatchItem,
  ): Promise<OrchestrationDispatchPlan> {
    const campaignId = String(item.campaign.id);
    const handle = await this.agentRuntimeService.startTurn({
      agentType: this.requireAgentType(item.strategy.agentType),
      autonomyMode: item.strategy.autonomyMode,
      brandId: item.campaign.brandId ?? undefined,
      campaignId,
      creditBudget: item.creditBudget,
      label: `Campaign orchestrator: ${item.campaign.label} -> ${item.strategy.label}`,
      metadata: {
        campaignId,
        ...this.buildRotationMetadata(item.rotationSelection),
        dispatchedBy: 'campaign_orchestrator',
        dispatchedStrategyId: String(item.strategy.id),
        reason: item.reason,
      },
      model: this.normalizeModel(item.strategy.model),
      objective: item.objective,
      organizationId: item.organizationId,
      strategyId: String(item.strategy.id),
      threadTitle: `${item.campaign.label ?? 'Campaign'} · ${item.strategy.label ?? item.strategy.id}`,
      userId: item.userId,
    });
    return {
      agentType: this.requireAgentType(item.strategy.agentType),
      objective: item.objective,
      reason: item.reason,
      executionId: handle.executionId,
      strategyId: String(item.strategy.id),
    };
  }

  summarizeOrchestration(
    state: CampaignOrchestrationState,
    dispatchedRuns: OrchestrationDispatchPlan[],
  ): CampaignOrchestrationState & {
    annotationItems: Array<{
      organizationId: string;
      plan: OrchestrationDispatchPlan;
      rotationSelection?: ContentRotationSelection;
      summary: string;
    }>;
  } {
    const summary =
      state.summary ??
      this.buildCycleSummary(
        state.campaign,
        dispatchedRuns,
        state.analyticsOverview,
        state.goalSummaries,
        state.rotationSelection,
      );
    return {
      ...state,
      annotationItems: dispatchedRuns.map((plan) => ({
        organizationId: state.organizationId,
        plan,
        rotationSelection: state.rotationSelection,
        summary,
      })),
      dispatchedRuns,
      nextOrchestratedAt:
        state.nextOrchestratedAt ??
        this.computeNextRunAt(state.campaign, new Date()).toISOString(),
      summary,
    };
  }

  async captureOrchestrationMemory(
    state: CampaignOrchestrationState,
  ): Promise<CampaignOrchestrationState> {
    const dispatchedRuns = state.dispatchedRuns ?? [];
    if (dispatchedRuns.length === 0) {
      return { ...state, memoryCaptured: false };
    }
    await this.captureDecisionMemory(
      state.campaign,
      state.analyticsOverview,
      dispatchedRuns,
      state.goalSummaries,
      state.summary ?? '',
    );
    return { ...state, memoryCaptured: true };
  }

  async annotateOrchestrationRun(item: {
    organizationId: string;
    plan: OrchestrationDispatchPlan;
    rotationSelection?: ContentRotationSelection;
    summary: string;
  }): Promise<OrchestrationDispatchPlan> {
    void item.organizationId;
    void item.rotationSelection;
    void item.summary;
    return item.plan;
  }

  async finalizeOrchestration(
    state: CampaignOrchestrationState,
  ): Promise<ContentEngineCycleResult> {
    return this.finalizeCycle(state.campaign, {
      dispatchedRuns: state.dispatchedRuns ?? [],
      nextOrchestratedAt: state.nextOrchestratedAt
        ? new Date(state.nextOrchestratedAt)
        : null,
      ...(state.skippedReason ? { skippedReason: state.skippedReason } : {}),
      ...(state.completeCampaign ? { status: 'completed' as const } : {}),
      summary: state.summary ?? 'Campaign orchestration completed.',
    });
  }

  async planTriggeredDispatches(
    input: TriggeredCampaignDispatchInput,
  ): Promise<TriggeredCampaignDispatchState> {
    const campaign = await this.agentCampaignsService.findOneById(
      input.campaignId,
      input.organizationId,
    );

    if (!campaign) {
      throw new NotFoundException('Campaign', input.campaignId);
    }

    if (campaign.status !== 'active') {
      return {
        campaign,
        input,
        items: [],
        nextOrchestratedAt:
          this.normalizeDate(campaign.nextOrchestratedAt)?.toISOString() ??
          null,
        skippedReason: `Campaign is ${campaign.status}, skipping trigger dispatch.`,
        summary: `Skipped trigger dispatch because campaign status is ${campaign.status}.`,
      };
    }

    if (input.strategies.length === 0) {
      return {
        campaign,
        input,
        items: [],
        nextOrchestratedAt:
          this.normalizeDate(campaign.nextOrchestratedAt)?.toISOString() ??
          null,
        skippedReason: 'No strategies selected for trigger dispatch.',
        summary:
          'Skipped trigger dispatch because no strategies were selected.',
      };
    }

    const organizationId = input.organizationId;
    const userId = this.requireCampaignUserId(campaign, input.campaignId);
    const goalSummaries = await this.loadGoalSummaries(
      input.strategies,
      organizationId,
    );
    const analyticsOverview = await this.loadAnalyticsOverview(campaign);
    const remainingCampaignBudget = this.getRemainingCampaignBudget(campaign);

    if (remainingCampaignBudget !== null && remainingCampaignBudget <= 0) {
      return {
        campaign,
        input,
        items: [],
        nextOrchestratedAt:
          this.normalizeDate(campaign.nextOrchestratedAt)?.toISOString() ??
          null,
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

    const items = input.strategies.map((strategy) => {
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

      return {
        campaign,
        creditBudget,
        input,
        objective,
        reason,
        strategy,
        userId,
      };
    });
    return {
      campaign,
      input,
      items,
      nextOrchestratedAt:
        this.normalizeDate(campaign.nextOrchestratedAt)?.toISOString() ?? null,
    };
  }

  async dispatchTriggeredItem(
    item: TriggeredCampaignDispatchItem,
  ): Promise<OrchestrationDispatchPlan> {
    const handle = await this.agentRuntimeService.startTurn({
      agentType: this.requireAgentType(item.strategy.agentType),
      autonomyMode: item.strategy.autonomyMode,
      brandId: item.campaign.brandId ?? undefined,
      campaignId: item.input.campaignId,
      creditBudget: item.creditBudget,
      label: `Campaign trigger: ${item.campaign.label} -> ${item.strategy.label}`,
      metadata: {
        campaignId: item.input.campaignId,
        dispatchedBy: 'campaign_trigger_evaluator',
        dispatchedStrategyId: String(item.strategy.id),
        triggerMetadata: item.input.triggerMetadata,
        triggerType: item.input.triggerType,
      },
      model: this.normalizeModel(item.strategy.model),
      objective: item.objective,
      organizationId: item.input.organizationId,
      strategyId: String(item.strategy.id),
      threadTitle: `${item.campaign.label ?? 'Campaign'} · ${item.strategy.label ?? item.strategy.id}`,
      userId: item.userId,
    });
    return {
      agentType: this.requireAgentType(item.strategy.agentType),
      objective: item.objective,
      reason: item.reason,
      executionId: handle.executionId,
      strategyId: String(item.strategy.id),
    };
  }

  async annotateTriggeredRun(input: {
    dispatch: OrchestrationDispatchPlan;
    trigger: TriggeredCampaignDispatchInput;
  }): Promise<OrchestrationDispatchPlan> {
    void input.trigger;
    return input.dispatch;
  }

  finalizeTriggeredDispatches(
    state: TriggeredCampaignDispatchState,
    dispatchedRuns: OrchestrationDispatchPlan[],
  ): ContentEngineCycleResult {
    const summary =
      state.summary ??
      `Dispatched ${dispatchedRuns.length} run(s) for ${state.input.triggerType}.`;
    return {
      campaignId: state.input.campaignId,
      dispatchCount: dispatchedRuns.length,
      dispatchedRuns,
      nextOrchestratedAt: state.nextOrchestratedAt,
      ...(state.skippedReason ? { skippedReason: state.skippedReason } : {}),
      summary,
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
          .filter((goalId): goalId is string => Boolean(goalId))
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

  private async loadRecentRotationRuns(
    campaign: AgentCampaignDocument,
    organizationId: string,
    contentRotation: IAgentCampaignContentRotation,
  ): Promise<Array<{ metadata?: Record<string, unknown> }>> {
    const lookbackDays =
      this.contentRotationService.getLookbackDays(contentRotation);
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const campaignId = String(campaign.id);
    const executions = await this.prisma.workflowExecution.findMany({
      orderBy: { createdAt: 'desc' },
      select: { result: true },
      take: 1000,
      where: scopedWhere(organizationId, {
        createdAt: { gte: since },
        result: { path: ['metadata', 'campaignId'], equals: campaignId },
      }),
    });

    return executions.map((execution) => {
      const result = this.readRecord(execution.result);
      return { metadata: this.readRecord(result?.metadata) ?? {} };
    });
  }

  /**
   * Resolve the campaign owner from its scalar FK column.
   *
   * `campaign.user` is a Mongo-era alias that is `undefined` on an unpopulated
   * Prisma read, so `String(campaign.user)` produced the literal `"undefined"`.
   * That id then owns every agent run dispatched for the cycle, and the
   * `NOT NULL` FK write fails at Postgres (P2003) only after the orchestration
   * side effects have already run — so this fails closed up front instead.
   */
  private requireCampaignUserId(
    campaign: AgentCampaignDocument,
    campaignId: string,
  ): string {
    return requireRelationId(campaign.userId, 'user', `Campaign ${campaignId}`);
  }

  private async loadAnalyticsOverview(
    campaign: AgentCampaignDocument,
  ): Promise<AnalyticsOverview> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    const overview = await this.analyticsService.getOverview(
      sevenDaysAgo.toISOString(),
      now.toISOString(),
      // Scalar FKs: the relation aliases are `undefined` on an unpopulated read
      // and stringify to "[object Object]" on a populated one — either way the
      // overview gets scoped to a brand/organization that does not exist.
      campaign.brandId ?? undefined,
      requireRelationId(
        campaign.organizationId,
        'organization',
        `Campaign ${campaign.id}`,
      ),
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
    rotationSelection?: ContentRotationSelection,
  ): string {
    const engagementRate = Number(
      analyticsOverview.avgEngagementRate ?? 0,
    ).toFixed(2);
    const totalViews = Math.round(analyticsOverview.totalViews ?? 0);
    const topicsList = this.getStrategyTopics(strategy);
    const topics =
      topicsList.length > 0 ? topicsList.join(', ') : 'campaign priorities';

    const baseReason = `${strategy.label} is aligned to ${topics} with recent campaign engagement at ${engagementRate}% and ${totalViews} views over the last 7 days.`;

    if (!rotationSelection) {
      return baseReason;
    }

    return `${baseReason} Weighted content rotation selected ${rotationSelection.label ?? rotationSelection.key} because its recent share is ${(rotationSelection.actualShare * 100).toFixed(1)}% against a ${(rotationSelection.targetShare * 100).toFixed(1)}% target.`;
  }

  private buildDispatchObjective(
    campaign: AgentCampaignDocument,
    strategy: AgentStrategyDocument,
    goalSummaries: string[],
    analyticsOverview: AnalyticsOverview,
    rotationSelection?: ContentRotationSelection,
  ): string {
    const topics = this.getStrategyTopics(strategy);
    const lines = [
      `Campaign: ${campaign.label}`,
      `Campaign brief: ${campaign.brief || 'No campaign brief provided.'}`,
      `Strategy: ${strategy.label}`,
      `Role: ${strategy.displayRole || strategy.agentType}`,
      `Topics: ${topics.join(', ') || 'No topics configured.'}`,
      `Recent 7-day analytics: ${Math.round(analyticsOverview.totalViews ?? 0)} views, ${Math.round(analyticsOverview.totalPosts ?? 0)} tracked posts, ${(analyticsOverview.avgEngagementRate ?? 0).toFixed(2)}% average engagement.`,
    ];

    if (rotationSelection) {
      lines.push(
        `Weighted rotation target: ${rotationSelection.label ?? rotationSelection.key}${rotationSelection.topic ? ` topic=${rotationSelection.topic}` : ''}${rotationSelection.platform ? ` platform=${rotationSelection.platform}` : ''}. Recent share ${(rotationSelection.actualShare * 100).toFixed(1)}%; target share ${(rotationSelection.targetShare * 100).toFixed(1)}%.`,
      );
    }

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
    const strategyPlatforms = this.getStrategyPlatforms(strategy);
    const recommendedPostingTimes = input.postingRecommendations
      .filter((recommendation) =>
        strategyPlatforms.length > 0
          ? strategyPlatforms.includes(recommendation.platform)
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
    rotationSelection?: ContentRotationSelection,
  ): string {
    const dispatchLines = dispatchedRuns.map(
      (dispatch) =>
        `- ${dispatch.agentType} via strategy ${dispatch.strategyId}: ${dispatch.reason}`,
    );

    const goalSection =
      goalSummaries.length > 0
        ? `Goals:\n- ${goalSummaries.join('\n- ')}\n\n`
        : '';

    const rotationSection = rotationSelection
      ? [
          '',
          `Weighted rotation: selected ${rotationSelection.label ?? rotationSelection.key} (${(rotationSelection.actualShare * 100).toFixed(1)}% recent share vs ${(rotationSelection.targetShare * 100).toFixed(1)}% target).`,
        ]
      : [];

    return [
      `Campaign ${campaign.label} dispatched ${dispatchedRuns.length} specialist run(s).`,
      '',
      `Recent analytics: ${Math.round(analyticsOverview.totalViews ?? 0)} views, ${Math.round(analyticsOverview.totalPosts ?? 0)} posts, ${(analyticsOverview.avgEngagementRate ?? 0).toFixed(2)}% average engagement.`,
      ...rotationSection,
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
    // Scalar FKs: the memory row is owned by the campaign's user/organization, and
    // the aliases would have written the literal string "undefined" into both.
    await this.agentMemoryCaptureService.capture(
      this.requireCampaignUserId(campaign, String(campaign.id)),
      requireRelationId(
        campaign.organizationId,
        'organization',
        `Campaign ${campaign.id}`,
      ),
      {
        brandId: campaign.brandId ?? undefined,
        campaignId: String(campaign.id),
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
        sourceContentId: String(campaign.id),
        sourceType: 'campaign-orchestrator',
        summary: goalSummaries.length
          ? `Campaign orchestrator dispatched ${dispatchedRuns.length} runs against ${goalSummaries.length} active goal signal(s).`
          : `Campaign orchestrator dispatched ${dispatchedRuns.length} runs.`,
        tags: [`campaign:${String(campaign.id)}`, 'orchestrator', 'campaign'],
      },
    );
  }

  private buildRotationMetadata(
    selection?: ContentRotationSelection,
  ): Record<string, unknown> {
    if (!selection) {
      return {};
    }

    return {
      contentRotationActualShare: selection.actualShare,
      contentRotationPlatform: selection.platform,
      contentRotationTargetKey: selection.key,
      contentRotationTargetLabel: selection.label,
      contentRotationTargetShare: selection.targetShare,
      contentRotationTopic: selection.topic,
    };
  }

  private getCampaignContentRotation(
    campaign: AgentCampaignDocument,
  ): IAgentCampaignContentRotation | undefined {
    if (this.isContentRotation(campaign.contentRotation)) {
      return campaign.contentRotation;
    }

    const config = this.readRecord(
      (campaign as Record<string, unknown>).config,
    );
    const contentRotation = config?.contentRotation;
    return this.isContentRotation(contentRotation)
      ? contentRotation
      : undefined;
  }

  private isContentRotation(
    value: unknown,
  ): value is IAgentCampaignContentRotation {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private computeNextRunAt(campaign: AgentCampaignDocument, from: Date): Date {
    const intervalHours =
      typeof campaign.orchestrationIntervalHours === 'number' &&
      campaign.orchestrationIntervalHours > 0
        ? campaign.orchestrationIntervalHours
        : DEFAULT_ORCHESTRATION_INTERVAL_HOURS;

    return new Date(from.getTime() + intervalHours * 60 * 60 * 1000);
  }

  private async finalizeCycle(
    campaign: AgentCampaignDocument,
    input: {
      dispatchedRuns: OrchestrationDispatchPlan[];
      nextOrchestratedAt: Date | null;
      skippedReason?: string;
      status?: 'completed';
      summary: string;
    },
  ): Promise<ContentEngineCycleResult> {
    const now = new Date();

    await this.agentCampaignsService.patch(String(campaign.id), {
      lastOrchestratedAt: now,
      lastOrchestrationSummary: input.summary,
      nextOrchestratedAt: input.nextOrchestratedAt ?? null,
      organizationId: requireRelationId(
        campaign.organizationId,
        'organization',
        `Campaign ${campaign.id}`,
      ),
      ...(input.status ? { status: input.status } : {}),
    });

    this.logger.log(`${this.logContext} finalized orchestration cycle`, {
      campaignId: String(campaign.id),
      dispatchCount: input.dispatchedRuns.length,
      nextOrchestratedAt: input.nextOrchestratedAt?.toISOString(),
      skippedReason: input.skippedReason,
    });

    return {
      campaignId: String(campaign.id),
      dispatchCount: input.dispatchedRuns.length,
      dispatchedRuns: input.dispatchedRuns,
      nextOrchestratedAt: input.nextOrchestratedAt?.toISOString() ?? null,
      ...(input.skippedReason ? { skippedReason: input.skippedReason } : {}),
      summary: input.summary,
    };
  }
}
