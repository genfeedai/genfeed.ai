import { AgentRunsService } from '@server/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@server/collections/agent-threads/services/agent-threads.service';
import { AgentRunQueueService } from '@server/queues/agent-run/agent-run-queue.service';
import { AgentThreadEngineService } from '@server/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadStatus } from '@genfeedai/enums';
import type {
  IAgentRuntimeStartTurnInput,
  IAgentRuntimeTurnHandle,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Thin runtime facade for non-chat turn starts (campaigns, future task loops).
 * Chat still goes through AgentOrchestratorService; this module owns the
 * create-run + queue + thread provenance sequence for automation callers.
 */
@Injectable()
export class AgentRuntimeService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly agentThreadsService: AgentThreadsService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {}

  async startTurn(
    input: IAgentRuntimeStartTurnInput,
  ): Promise<IAgentRuntimeTurnHandle> {
    const threadId =
      input.threadId ?? (await this.createThreadForTurn(input)).id;

    const run = await this.agentRunsService.create({
      brandId: input.brandId ?? undefined,
      creditBudget: input.creditBudget,
      label: input.label,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.model ? { model: input.model } : {}),
        source: input.campaignId ? 'campaign' : 'runtime',
        threadId,
      },
      objective: input.objective,
      organizationId: input.organizationId,
      strategyId: input.strategyId,
      threadId,
      trigger: input.trigger,
      userId: input.userId,
    });

    const runId = String(run.id);

    await this.agentRunQueueService.queueRun({
      agentType: input.agentType,
      autonomyMode: input.autonomyMode,
      campaignId: input.campaignId,
      creditBudget: input.creditBudget,
      model: input.model,
      objective: input.objective,
      organizationId: input.organizationId,
      runId,
      strategyId: input.strategyId,
      threadId,
      userId: input.userId,
    });

    await this.appendTurnRequestedBestEffort({
      objective: input.objective,
      organizationId: input.organizationId,
      runId,
      threadId,
      userId: input.userId,
    });

    this.logger.log(`${this.constructorName} started turn`, {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
      runId,
      strategyId: input.strategyId,
      threadId,
    });

    return { runId, threadId };
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
    objective: string;
    organizationId: string;
    runId: string;
    threadId: string;
    userId: string;
  }): Promise<void> {
    if (!this.agentThreadEngineService) {
      return;
    }

    try {
      await this.agentThreadEngineService.appendEvent({
        commandId: `turn-requested:${params.runId}`,
        organizationId: params.organizationId,
        payload: {
          detail: params.objective.slice(0, 280),
          label: 'Turn requested',
          status: 'queued',
        },
        runId: params.runId,
        threadId: params.threadId,
        type: 'thread.turn_requested',
        userId: params.userId,
      });
    } catch (error) {
      this.logger.warn(
        `${this.constructorName} failed to append turn.requested (best-effort)`,
        {
          error: (error as Error)?.message,
          runId: params.runId,
          threadId: params.threadId,
        },
      );
    }
  }
}
