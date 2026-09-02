import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type {
  AgentOrchestratorUiActionHost,
  ThreadUiActionExecutionParams,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatRequest,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentAutonomyMode, RouterPriority } from '@genfeedai/contracts';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

type PlanAction = 'approve_plan' | 'revise_plan';

@Injectable()
export class AgentOrchestratorUiActionPlanService {
  constructor(
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {}

  async execute(
    action: PlanAction,
    params: ThreadUiActionExecutionParams,
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    return action === 'approve_plan'
      ? this.executeApprovedPlan(params, host)
      : this.executeRevisedPlan(params, host);
  }

  private async executeApprovedPlan(
    params: ThreadUiActionExecutionParams,
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const latestPlan = await this.readLatestPlan(params);
    const planContent =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';
    const planId =
      typeof latestPlan?.id === 'string'
        ? latestPlan.id
        : typeof params.payload?.planId === 'string'
          ? params.payload.planId
          : 'plan';
    if (!planContent.trim()) {
      throw new BadRequestException(
        'No proposed plan is available to approve.',
      );
    }
    await this.threadEventRecorder.recordPlanUpserted({
      context: params.context,
      plan: {
        approvedAt: new Date().toISOString(),
        awaitingApproval: false,
        content: planContent,
        explanation:
          typeof latestPlan?.explanation === 'string'
            ? latestPlan.explanation
            : undefined,
        id: planId,
        lastReviewAction: 'approve',
        status: 'approved',
        steps: Array.isArray(latestPlan?.steps)
          ? (latestPlan.steps as Record<string, unknown>[])
          : undefined,
      },
      runId: params.context.executionId,
      threadId: params.threadId,
    });
    const request: AgentChatRequest = {
      content: `Execute the approved plan exactly as written below. Do not regenerate a new plan unless the user explicitly asks.\n\nApproved plan:\n${planContent}`,
      model: params.model,
      source: 'agent',
      threadId: params.threadId,
    };
    const priority =
      params.context.generationPriority ?? RouterPriority.BALANCED;
    return host.executeSynchronousChatLoop({
      context: params.context,
      generationPriority: priority,
      model: params.model,
      policy: {
        allowAdvancedOverrides: false,
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        brandId: params.context.scope?.brandId,
        creditGovernance: { useOrganizationPool: true },
        generationModelOverride: undefined,
        generationPriority: priority,
        platform: undefined,
        qualityTier: 'balanced',
        reviewModelOverride: undefined,
        scope: params.context.scope,
        thinkingModelOverride: undefined,
      } as ResolvedAgentExecutionPolicy,
      request,
      resolvedMemories: [],
      seedTitle: '',
      systemPromptOverride: undefined,
      threadId: params.threadId,
      turnCost: await this.agentChatModelRegistry.getRoundCredits(params.model),
    });
  }

  private async executeRevisedPlan(
    params: ThreadUiActionExecutionParams,
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const latestPlan = await this.readLatestPlan(params);
    const revisionNote =
      typeof params.payload?.revisionNote === 'string'
        ? params.payload.revisionNote.trim()
        : '';
    const previousPlan =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';
    const request: AgentChatRequest = {
      content: revisionNote
        ? `Revise the current implementation plan using this feedback: ${revisionNote}`
        : 'Revise the current implementation plan and keep execution paused for review.',
      model: params.model,
      source: 'agent',
      systemPromptOverride: previousPlan
        ? `Current proposed plan:\n${previousPlan}`
        : undefined,
      threadId: params.threadId,
    };
    return host.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request,
      resolvedMemories: [],
      reviewMetadata: {
        lastReviewAction: 'request_changes',
        revisionNote: revisionNote || undefined,
      },
      seedTitle: '',
      systemPromptOverride: request.systemPromptOverride,
      threadId: params.threadId,
      turnCost: await this.agentChatModelRegistry.getRoundCredits(params.model),
    });
  }

  private async readLatestPlan(
    params: ThreadUiActionExecutionParams,
  ): Promise<Record<string, unknown> | undefined> {
    const snapshot = await runEffectPromise(
      this.getThreadSnapshotEffect(
        params.threadId,
        params.context.organizationId,
        params.context.userId,
      ),
    );
    return snapshot?.latestProposedPlan as Record<string, unknown> | undefined;
  }

  private getThreadSnapshotEffect(
    threadId: string,
    organizationId: string,
    userId: string,
  ): Effect.Effect<
    Awaited<ReturnType<AgentThreadEngineService['getSnapshot']>> | null,
    unknown
  > {
    return this.agentThreadEngineService
      ? this.agentThreadEngineService.getSnapshotEffect(
          threadId,
          organizationId,
          userId,
        )
      : Effect.succeed(null);
  }
}
