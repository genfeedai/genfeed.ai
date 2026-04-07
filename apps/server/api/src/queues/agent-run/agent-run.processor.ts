/**
 * Agent Run Processor
 *
 * BullMQ worker that processes agent run jobs:
 * 1. Start the run record
 * 2. Call AgentOrchestratorService.chat() with run objective
 * 3. Track completion/failure in the run record
 * 4. Update strategy state (recordRun, failures) after execution
 * 5. Publish stream events for real-time UI updates
 */
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentRunJobData } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { AgentRunStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';

const FAILURES_BEFORE_PAUSE = 3;
const FAILURES_BEFORE_MANUAL_REACTIVATION = 5;

function extractRunCompletionSummary(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  const record = result as Record<string, unknown>;

  if (typeof record.summary === 'string' && record.summary.trim()) {
    return record.summary.trim();
  }

  if (typeof record.content === 'string' && record.content.trim()) {
    return record.content.trim();
  }

  const message = record.message;
  if (message && typeof message === 'object') {
    const messageContent = (message as { content?: unknown }).content;
    if (
      typeof messageContent === 'string' &&
      messageContent.trim().length > 0
    ) {
      return messageContent.trim();
    }
  }

  return undefined;
}

function extractRunThreadId(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  const threadId = (result as { threadId?: unknown }).threadId;

  return typeof threadId === 'string' && threadId.trim().length > 0
    ? threadId.trim()
    : undefined;
}

@Processor('agent-run', {
  concurrency: 3,
  limiter: { duration: 60000, max: 20 },
})
export class AgentRunProcessor extends WorkerHost {
  private readonly logContext = 'AgentRunProcessor';

  constructor(
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => AgentRunsService))
    private readonly agentRunsService: AgentRunsService,
    @Inject(forwardRef(() => AgentOrchestratorService))
    private readonly agentOrchestratorService: AgentOrchestratorService,
    @Inject(forwardRef(() => AgentStrategiesService))
    private readonly agentStrategiesService: AgentStrategiesService,
    @Inject(forwardRef(() => AgentStrategyAutopilotService))
    private readonly agentStrategyAutopilotService: AgentStrategyAutopilotService,
    private readonly agentStreamPublisherService: AgentStreamPublisherService,
    @Optional()
    private readonly campaignExecutionService: AgentCampaignExecutionService,
    @Optional()
    @Inject(forwardRef(() => TaskOrchestratorService))
    private readonly taskOrchestratorService?: TaskOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<AgentRunJobData>): Promise<void> {
    const { data } = job;
    const url = `${this.logContext} process`;

    this.logger.log(`${url} starting`, {
      objective: data.objective?.substring(0, 100),
      runId: data.runId,
      strategyId: data.strategyId,
    });

    try {
      // 1. Mark run as running
      const run = await this.agentRunsService.start(
        data.runId,
        data.organizationId,
      );

      if (!run) {
        throw new Error(`Agent run ${data.runId} not found`);
      }

      // 2. Publish run start event
      this.agentStreamPublisherService.publishRunStart({
        label: run.label,
        organizationId: data.organizationId,
        runId: data.runId,
        timestamp: new Date().toISOString(),
        userId: data.userId,
      });

      // 3. Execute via deterministic autopilot path for strategies.
      const result = data.strategyId
        ? await this.agentStrategyAutopilotService.executeQueuedRun({
            defaultModel: data.model,
            organizationId: data.organizationId,
            runId: data.runId,
            strategyId: data.strategyId,
            userId: data.userId,
          })
        : await this.agentOrchestratorService.chat(
            {
              content:
                data.objective ||
                'Execute proactive content generation based on strategy configuration.',
              model: data.model,
              source: 'proactive',
            },
            {
              campaignId: data.campaignId,
              organizationId: data.organizationId,
              runId: data.runId,
              strategyId: data.strategyId,
              userId: data.userId,
            },
          );

      // 4. Complete the run
      const summary = extractRunCompletionSummary(result);
      const threadId = extractRunThreadId(result);

      if (threadId && Types.ObjectId.isValid(threadId)) {
        await this.agentRunsService.patch(data.runId, {
          thread: new Types.ObjectId(threadId),
        } as Record<string, unknown>);
        await this.agentRunsService.mergeMetadata(
          data.runId,
          data.organizationId,
          { threadId },
        );
      }

      const completedRun = await this.agentRunsService.complete(
        data.runId,
        data.organizationId,
        summary,
      );

      // 5. Update strategy state with actual execution metrics
      if (data.strategyId && completedRun) {
        const completedToolCalls = completedRun.toolCalls?.filter(
          (tc) => tc.status === 'completed',
        );

        await this.agentStrategiesService.recordRun(data.strategyId, {
          completedAt: completedRun.completedAt ?? new Date(),
          contentGenerated:
            Number((result as Record<string, unknown>)?.contentGenerated) ||
            completedToolCalls?.length ||
            0,
          creditsUsed:
            Number((result as Record<string, unknown>)?.creditsUsed) ||
            completedRun.creditsUsed ||
            0,
          startedAt: completedRun.startedAt ?? new Date(),
          status: AgentRunStatus.COMPLETED,
          threadId: data.runId,
        });

        await this.agentStrategiesService.resetFailures(data.strategyId);
      }

      // 5b. Update campaign credits and check quota
      if (data.campaignId && this.campaignExecutionService) {
        const creditsUsed = completedRun?.creditsUsed ?? 0;
        if (creditsUsed > 0) {
          await this.campaignExecutionService.updateCreditsUsed(
            data.campaignId,
            creditsUsed,
          );
        }
        await this.campaignExecutionService.checkQuota(data.campaignId);
      }

      // 5c. Workspace task result rollup
      if (
        this.taskOrchestratorService &&
        completedRun?.metadata?.workspaceTaskId
      ) {
        this.taskOrchestratorService
          .handleRunCompletion(data.runId, data.organizationId)
          .catch((rollupError: unknown) => {
            this.logger.error(
              `${url} workspace task rollup failed`,
              rollupError,
            );
          });
      }

      // 6. Publish completion
      this.agentStreamPublisherService.publishRunComplete({
        organizationId: data.organizationId,
        runId: data.runId,
        status: 'completed',
        timestamp: new Date().toISOString(),
        userId: data.userId,
      });

      this.logger.log(`${url} completed`, { runId: data.runId });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`${url} failed`, error);

      await this.agentRunsService.fail(
        data.runId,
        data.organizationId,
        errorMessage,
      );

      // Update strategy failure tracking
      if (data.strategyId) {
        const newFailureCount =
          await this.agentStrategiesService.incrementFailures(data.strategyId);

        if (newFailureCount >= FAILURES_BEFORE_PAUSE) {
          if (newFailureCount >= FAILURES_BEFORE_MANUAL_REACTIVATION) {
            await this.agentStrategiesService.requireManualReactivation(
              data.strategyId,
            );
          } else {
            await this.agentStrategiesService.pauseStrategy(data.strategyId);
          }
          this.logger.warn(
            `Strategy ${data.strategyId} auto-paused after ${newFailureCount} consecutive failures`,
            this.logContext,
          );
        }
      }

      // Workspace task rollup on failure
      if (this.taskOrchestratorService) {
        this.taskOrchestratorService
          .handleRunCompletion(data.runId, data.organizationId)
          .catch((rollupError: unknown) => {
            this.logger.error(
              `${url} workspace task rollup failed (on run failure)`,
              rollupError,
            );
          });
      }

      this.agentStreamPublisherService.publishRunComplete({
        error: errorMessage,
        organizationId: data.organizationId,
        runId: data.runId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        userId: data.userId,
      });

      throw error; // Let BullMQ handle retry
    }
  }
}
