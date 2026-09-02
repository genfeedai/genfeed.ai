import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type {
  IAgentRuntimeStartTurnInput,
  IAgentRuntimeTurnHandle,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

const AGENT_TURN_WORKFLOW_ID = 'agent.turn.execute';

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly logger: LoggerService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {}

  async startTurn(
    input: IAgentRuntimeStartTurnInput,
  ): Promise<IAgentRuntimeTurnHandle> {
    const threadId =
      input.threadId ?? (await this.createThreadForTurn(input)).id;
    const { executionId } = await this.workflowRunner.enqueueWorkflow({
      actionType: AGENT_TURN_WORKFLOW_ID,
      canonicalId: AGENT_TURN_WORKFLOW_ID,
      ...(typeof input.metadata?.clientRequestId === 'string'
        ? {
            idempotencyKey: [
              AGENT_TURN_WORKFLOW_ID,
              input.organizationId,
              input.userId,
              input.metadata.clientRequestId,
            ].join(':'),
          }
        : {}),
      inputValues: {
        request: {
          content: input.objective,
          strategyId: input.strategyId,
          threadId,
          ...(input.agentType ? { agentType: input.agentType } : {}),
          ...(input.autonomyMode ? { autonomyMode: input.autonomyMode } : {}),
          ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
          ...(input.campaignId ? { campaignId: input.campaignId } : {}),
          ...(input.creditBudget !== undefined
            ? { creditBudget: input.creditBudget }
            : {}),
          ...(input.model ? { model: input.model } : {}),
        },
      },
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        label: input.label,
        source: input.campaignId ? 'campaign' : 'runtime',
        threadId,
      },
      organizationId: input.organizationId,
      source: 'AgentRuntimeService.startTurn',
      userId: input.userId,
    });

    await this.appendTurnRequestedBestEffort({
      executionId,
      objective: input.objective,
      organizationId: input.organizationId,
      threadId,
      userId: input.userId,
    });
    this.logger.log('Agent workflow execution started', {
      campaignId: input.campaignId,
      executionId,
      organizationId: input.organizationId,
      strategyId: input.strategyId,
      threadId,
    });
    return { executionId, threadId };
  }

  private async createThreadForTurn(
    input: IAgentRuntimeStartTurnInput,
  ): Promise<{ id: string }> {
    const title =
      input.threadTitle?.trim() || input.label.slice(0, 120) || 'Campaign run';
    const thread = await this.agentThreadsService.create({
      brandId: input.brandId ?? undefined,
      organizationId: input.organizationId,
      source: input.campaignId ? 'campaign' : 'runtime',
      status: AgentThreadStatus.ACTIVE,
      title,
      userId: input.userId,
    });
    return { id: String(thread.id) };
  }

  private async appendTurnRequestedBestEffort(params: {
    executionId: string;
    objective: string;
    organizationId: string;
    threadId: string;
    userId: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) return;
    try {
      await this.agentThreadEngineService.appendEvent({
        commandId: `turn-requested:${params.executionId}`,
        organizationId: params.organizationId,
        payload: {
          detail: params.objective.slice(0, 280),
          executionId: params.executionId,
          label: 'Turn requested',
          status: 'queued',
        },
        threadId: params.threadId,
        type: 'thread.turn_requested',
        userId: params.userId,
      });
    } catch (error) {
      this.logger.warn('Failed to append turn.requested (best-effort)', {
        error: error instanceof Error ? error.message : String(error),
        executionId: params.executionId,
        threadId: params.threadId,
      });
    }
  }
}
