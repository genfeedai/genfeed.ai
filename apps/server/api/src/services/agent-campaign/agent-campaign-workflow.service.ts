import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import {
  AGENT_CAMPAIGN_ACTION_IDS,
  AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS,
} from '@api/services/agent-campaign/agent-campaign-workflow-definition';
import {
  CampaignWinnerExtractionService,
  type CampaignWinnerExtractionState,
} from '@api/services/agent-campaign/campaign-winner-extraction.service';
import type {
  CampaignOrchestrationDispatchItem,
  CampaignOrchestrationState,
  ContentEngineCycleResult,
  OrchestrationDispatchPlan,
  TriggeredCampaignDispatchInput,
  TriggeredCampaignDispatchItem,
  TriggeredCampaignDispatchState,
} from '@api/services/agent-campaign/content-engine.service';
import { ContentEngineService } from '@api/services/agent-campaign/content-engine.service';
import type {
  PostingRecommendationItem,
  TriggerEvaluationState,
} from '@api/services/agent-campaign/trigger-evaluator.service';
import { TriggerEvaluatorService } from '@api/services/agent-campaign/trigger-evaluator.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

const MAX_CAMPAIGNS_PER_SWEEP = 20;

export type AgentCampaignWorkflowRequest = {
  campaignId: string;
  organizationId: string;
  scheduledAt?: Date;
  userId: string;
};

@Injectable()
export class AgentCampaignWorkflowService implements OnModuleInit {
  constructor(
    private readonly contentEngine: ContentEngineService,
    private readonly winnerExtraction: CampaignWinnerExtractionService,
    private readonly triggerEvaluator: TriggerEvaluatorService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_DISCOVER_DUE,
      (request) => this.discoverDueOrchestrations(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_LOAD_CONTEXT,
      (request) => this.loadOrchestrationContext(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_DISCOVER_DUE,
      (request) => this.discoverTriggerEvaluations(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_PLAN,
      (request) => this.planOrchestration(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_DISPATCH,
      (request) => this.dispatchOrchestration(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_SUMMARIZE,
      (request) => this.summarizeOrchestration(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_CAPTURE_MEMORY,
      (request) => this.captureOrchestrationMemory(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_ANNOTATE,
      (request) => this.annotateOrchestration(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.ORCHESTRATION_FINALIZE,
      (request) => this.finalizeOrchestration(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.MEMORY_LOAD_WINNERS,
      (request) => this.loadWinnerContext(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.MEMORY_PERSIST,
      (request) => this.persistWinnerMemory(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_LOAD_CONTEXT,
      (request) => this.loadTriggerContext(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PLAN_RECOMMENDATIONS,
      (request) => this.planTriggerRecommendations(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PERSIST_RECOMMENDATION,
      (request) => this.persistTriggerRecommendation(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PLAN_GROUPS,
      (request) => this.planTriggerGroups(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_PLAN_DISPATCHES,
      (request) => this.planTriggerDispatches(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_DISPATCH_RUN,
      (request) => this.dispatchTriggerRun(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_ANNOTATE_RUN,
      (request) => this.annotateTriggerRun(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_FINALIZE_GROUP,
      (request) => this.finalizeTriggerGroup(request),
    );
    this.runner.registerAction(
      AGENT_CAMPAIGN_ACTION_IDS.TRIGGERS_FINALIZE,
      (request) => this.finalizeTriggerEvaluation(request),
    );
    for (const definition of AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS) {
      this.runner.registerWorkflow(definition);
    }
  }

  private loadOrchestrationContext(request: SystemWorkflowActionRequest) {
    const input = this.readRequest(request);
    return this.contentEngine.loadOrchestrationContext(
      input.campaignId,
      input.organizationId,
    );
  }

  private async discoverDueOrchestrations(
    request: SystemWorkflowActionRequest,
  ) {
    const organizationId = request.context.organizationId;
    const campaigns = await this.prisma.agentCampaign.findMany({
      orderBy: { nextOrchestratedAt: 'asc' },
      take: MAX_CAMPAIGNS_PER_SWEEP,
      where: scopedWhere(organizationId, {
        nextOrchestratedAt: { lte: new Date() },
        orchestrationEnabled: true,
        status: 'active',
      }),
    });
    return {
      items: campaigns.map((campaign) => ({
        campaignId: campaign.id,
        organizationId,
        scheduledAt: (campaign.nextOrchestratedAt ?? new Date()).toISOString(),
        userId: campaign.userId,
      })),
    };
  }

  private planOrchestration(request: SystemWorkflowActionRequest) {
    return this.contentEngine.planOrchestrationDispatches(
      this.readState<CampaignOrchestrationState>(request.input.state, 'state'),
    );
  }

  private dispatchOrchestration(request: SystemWorkflowActionRequest) {
    return this.contentEngine.dispatchOrchestrationItem(
      this.readState<CampaignOrchestrationDispatchItem>(
        request.input.request,
        'dispatch item',
      ),
    );
  }

  private summarizeOrchestration(request: SystemWorkflowActionRequest) {
    const state = this.readState<CampaignOrchestrationState>(
      request.input.state,
      'state',
    );
    const dispatchedRuns = this.readBatch(request.input.batch).map(
      (result) => result as OrchestrationDispatchPlan,
    );
    return this.contentEngine.summarizeOrchestration(state, dispatchedRuns);
  }

  private captureOrchestrationMemory(request: SystemWorkflowActionRequest) {
    return this.contentEngine.captureOrchestrationMemory(
      this.readState<CampaignOrchestrationState>(request.input.state, 'state'),
    );
  }

  private annotateOrchestration(request: SystemWorkflowActionRequest) {
    return this.contentEngine.annotateOrchestrationRun(
      this.readState<
        Parameters<ContentEngineService['annotateOrchestrationRun']>[0]
      >(request.input.request, 'annotation item'),
    );
  }

  private finalizeOrchestration(request: SystemWorkflowActionRequest) {
    return this.contentEngine.finalizeOrchestration(
      this.readState<CampaignOrchestrationState>(request.input.state, 'state'),
    );
  }

  private loadWinnerContext(request: SystemWorkflowActionRequest) {
    const input = this.readRequest(request);
    return this.winnerExtraction.loadWinnerContext(
      input.campaignId,
      input.organizationId,
    );
  }

  private persistWinnerMemory(request: SystemWorkflowActionRequest) {
    return this.winnerExtraction.persistWinnerMemory(
      this.readState<CampaignWinnerExtractionState>(
        request.input.state,
        'winner state',
      ),
    );
  }

  private loadTriggerContext(request: SystemWorkflowActionRequest) {
    const input = this.readRequest(request);
    return this.triggerEvaluator.loadEvaluationContext(
      input.campaignId,
      input.organizationId,
    );
  }

  private async discoverTriggerEvaluations(
    request: SystemWorkflowActionRequest,
  ) {
    const organizationId = request.context.organizationId;
    const campaigns = await this.prisma.agentCampaign.findMany({
      include: { agents: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_CAMPAIGNS_PER_SWEEP,
      where: scopedWhere(organizationId, {
        agents: { some: { isDeleted: false } },
        orchestrationEnabled: true,
        status: 'active',
      }),
    });
    return {
      items: campaigns.map((campaign) => ({
        campaignId: campaign.id,
        organizationId,
        userId: campaign.userId,
      })),
    };
  }

  private planTriggerRecommendations(request: SystemWorkflowActionRequest) {
    return this.triggerEvaluator.planPostingRecommendations(
      this.readState<TriggerEvaluationState>(
        request.input.state,
        'trigger state',
      ),
    );
  }

  private persistTriggerRecommendation(request: SystemWorkflowActionRequest) {
    return this.triggerEvaluator.persistPostingRecommendation(
      this.readState<PostingRecommendationItem>(
        request.input.request,
        'posting recommendation',
      ),
    );
  }

  private planTriggerGroups(request: SystemWorkflowActionRequest) {
    return this.triggerEvaluator.planTriggerGroups(
      this.readState<TriggerEvaluationState>(
        request.input.state,
        'trigger state',
      ),
    );
  }

  private planTriggerDispatches(request: SystemWorkflowActionRequest) {
    return this.contentEngine.planTriggeredDispatches(
      this.readState<TriggeredCampaignDispatchInput>(
        request.input.request,
        'trigger group',
      ),
    );
  }

  private async dispatchTriggerRun(request: SystemWorkflowActionRequest) {
    const item = this.readState<TriggeredCampaignDispatchItem>(
      request.input.request,
      'trigger dispatch item',
    );
    return {
      dispatch: await this.contentEngine.dispatchTriggeredItem(item),
      trigger: item.input,
    };
  }

  private annotateTriggerRun(request: SystemWorkflowActionRequest) {
    return this.contentEngine.annotateTriggeredRun(
      this.readState<{
        dispatch: OrchestrationDispatchPlan;
        trigger: TriggeredCampaignDispatchInput;
      }>(request.input.state, 'trigger run state'),
    );
  }

  private finalizeTriggerGroup(request: SystemWorkflowActionRequest) {
    const state = this.readState<TriggeredCampaignDispatchState>(
      request.input.state,
      'trigger group state',
    );
    const dispatchedRuns = this.readBatch(request.input.batch).map(
      (result) => result as OrchestrationDispatchPlan,
    );
    return this.contentEngine.finalizeTriggeredDispatches(
      state,
      dispatchedRuns,
    );
  }

  private finalizeTriggerEvaluation(request: SystemWorkflowActionRequest) {
    const state = this.readState<TriggerEvaluationState>(
      request.input.state,
      'trigger state',
    );
    const results = this.readBatch(request.input.batch).map(
      (result) => result as ContentEngineCycleResult,
    );
    return this.triggerEvaluator.finalizeEvaluation(state, results);
  }

  private readRequest(
    action: SystemWorkflowActionRequest,
  ): AgentCampaignWorkflowRequest {
    const input = action.input.request;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Agent campaign workflow requires request');
    }
    const record = input as Record<string, unknown>;
    const organizationId = this.requiredString(
      record.organizationId,
      'organizationId',
    );
    if (organizationId !== action.context.organizationId) {
      throw new Error('Agent campaign workflow organization mismatch');
    }
    return {
      campaignId: this.requiredString(record.campaignId, 'campaignId'),
      organizationId,
      userId: this.requiredString(record.userId, 'userId'),
    };
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Agent campaign workflow requires ${field}`);
    }
    return value.trim();
  }

  private readState<T>(value: unknown, field: string): T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Agent campaign workflow requires ${field}`);
    }
    return value as T;
  }

  private readBatch(value: unknown): unknown[] {
    const record = this.readState<Record<string, unknown>>(value, 'batch');
    if (!Array.isArray(record.results)) {
      throw new Error('Agent campaign workflow requires batch results');
    }
    return [
      ...record.results.map((entry) =>
        this.readState<Record<string, unknown>>(entry, 'batch result'),
      ),
    ]
      .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
      .map((entry) => entry.result);
  }
}
