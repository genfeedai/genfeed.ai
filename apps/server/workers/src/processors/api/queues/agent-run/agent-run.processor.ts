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

import { ActionOrigin, AgentRunStatus } from '@genfeedai/enums';
import { AGENT_RUN_QUEUE, AgentRunJobData } from '@genfeedai/queue-contracts';
import { runWithActionOrigin } from '@genfeedai/server';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Optional } from '@nestjs/common';
import { AgentCampaignExecutionService } from '@server/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentRunsService } from '@server/collections/agent-runs/services/agent-runs.service';
import { AgentStrategiesService } from '@server/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@server/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { VoiceGenerationService } from '@server/collections/voices/services/voice-generation.service';
import { isEntityId } from '@server/helpers/validation/entity-id.validator';
import { AgentOrchestratorService } from '@server/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamPublisherService } from '@server/services/agent-orchestrator/agent-stream-publisher.service';
import type { AgentChatRequest } from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';
import { TaskOrchestratorService } from '@server/services/task-orchestration/task-orchestrator.service';
import { Job } from 'bullmq';

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

function readObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

@Processor(
  AGENT_RUN_QUEUE,
  withLongJobWorkerOptions({
    concurrency: 3,
    limiter: { duration: 60000, max: 20 },
  }),
)
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
    private readonly voiceGenerationService: VoiceGenerationService,
    @Optional()
    private readonly campaignExecutionService: AgentCampaignExecutionService,
    @Optional()
    @Inject(forwardRef(() => TaskOrchestratorService))
    private readonly taskOrchestratorService?: TaskOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<AgentRunJobData>): Promise<void> {
    return runWithActionOrigin(
      job.data.actionContext ?? { origin: ActionOrigin.AGENT },
      () => this.processRun(job),
    );
  }

  private async processRun(job: Job<AgentRunJobData>): Promise<void> {
    const { data } = job;
    const url = `${this.logContext} process`;

    this.logger.log(`${url} starting`, {
      objective: data.objective?.substring(0, 100),
      runId: data.runId,
      strategyId: data.strategyId,
    });

    if (data.kind === 'agent-chat-turn') {
      await this.processAcceptedChatTurn(job);
      return;
    }

    if (data.kind === 'voice-generation') {
      await this.processVoiceGeneration(data);
      return;
    }

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
      const runLabel = readString((run as Record<string, unknown>).label) ?? '';
      const runMetadata = readObjectRecord(
        (run as Record<string, unknown>).metadata,
      );

      this.agentStreamPublisherService.publishRunStart({
        label: runLabel,
        organizationId: data.organizationId,
        runId: data.runId,
        timestamp: new Date().toISOString(),
        userId: data.userId,
      });

      if (
        this.taskOrchestratorService &&
        readString(runMetadata?.workspaceTaskId)
      ) {
        this.taskOrchestratorService
          .handleRunStarted(data.runId, data.organizationId)
          .catch((rollupError: unknown) => {
            this.logger.error(
              `${url} workspace task run-start update failed`,
              rollupError,
            );
          });
      }

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
      const resultRecord = result as unknown as Record<string, unknown>;

      if (threadId && isEntityId(threadId)) {
        await this.agentRunsService.patch(data.runId, {
          threadId,
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
        const completedRunRecord = completedRun as unknown as Record<
          string,
          unknown
        >;
        const contentGenerated =
          readNumber(resultRecord.contentGenerated) ??
          completedToolCalls?.length ??
          0;
        const runCreditsUsed =
          readNumber(resultRecord.creditsUsed) ??
          readNumber(completedRunRecord.creditsUsed) ??
          0;

        await this.agentStrategiesService.recordRun(data.strategyId, {
          completedAt: completedRun.completedAt ?? new Date(),
          contentGenerated,
          creditsUsed: runCreditsUsed,
          startedAt: completedRun.startedAt ?? new Date(),
          status: AgentRunStatus.COMPLETED,
          threadId: data.runId,
        });

        await this.agentStrategiesService.resetFailures(data.strategyId);
      }

      // 5b. Update campaign credits and check quota
      if (data.campaignId && this.campaignExecutionService) {
        const completedRunRecord = completedRun as unknown as Record<
          string,
          unknown
        > | null;
        const creditsUsed = readNumber(completedRunRecord?.creditsUsed) ?? 0;
        if (creditsUsed > 0) {
          await this.campaignExecutionService.updateCreditsUsed(
            data.campaignId,
            data.organizationId,
            creditsUsed,
          );
        }
        await this.campaignExecutionService.checkQuota(
          data.campaignId,
          data.organizationId,
        );
      }

      // 5c. Workspace task result rollup
      const completedRunMetadata = readObjectRecord(
        (completedRun as unknown as Record<string, unknown> | null)?.metadata,
      );
      if (
        this.taskOrchestratorService &&
        readString(completedRunMetadata?.workspaceTaskId)
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

  private async processAcceptedChatTurn(
    job: Job<AgentRunJobData>,
  ): Promise<void> {
    const { data } = job;
    if (!data.request || !data.threadId || !data.clientRequestId) {
      throw new Error(`Agent chat run ${data.runId} has incomplete job data`);
    }

    const persistedRun = await this.agentRunsService.getById(
      data.runId,
      data.organizationId,
    );
    const configuredAttempts = Number(job.opts.attempts) || 1;
    const isDurableRetry =
      job.attemptsMade > 0 && job.attemptsMade < configuredAttempts;
    if (
      persistedRun &&
      [AgentRunStatus.COMPLETED, AgentRunStatus.CANCELLED].includes(
        String(persistedRun.status) as AgentRunStatus,
      )
    ) {
      this.logger.log(`${this.logContext} skipped terminal chat redelivery`, {
        organizationId: data.organizationId,
        runId: data.runId,
        status: persistedRun.status,
      });
      return;
    }
    if (
      persistedRun &&
      String(persistedRun.status) === AgentRunStatus.RUNNING &&
      !isDurableRetry
    ) {
      const persistedError =
        'Agent generation stopped before it could complete safely.';
      await this.agentRunsService.fail(
        data.runId,
        data.organizationId,
        persistedError,
      );
      await this.agentStreamPublisherService.publishError({
        error: 'Agent generation stopped safely. Please retry.',
        runId: data.runId,
        threadId: data.threadId,
        userId: data.userId,
      });
      this.agentStreamPublisherService.publishRunComplete({
        error: persistedError,
        organizationId: data.organizationId,
        runId: data.runId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        userId: data.userId,
      });
      return;
    }

    const request = data.request as unknown as AgentChatRequest;
    try {
      await this.agentOrchestratorService.chatStream(request, {
        apiKeyContext: data.apiKeyContext,
        authToken: data.encryptedAuthToken
          ? EncryptionUtil.decrypt(data.encryptedAuthToken)
          : undefined,
        executionMode: 'background',
        organizationId: data.organizationId,
        runId: data.runId,
        userId: data.userId,
      });
    } catch (error: unknown) {
      const attempts = configuredAttempts;
      const attempt = job.attemptsMade + 1;
      const isLastAttempt = attempt >= attempts;
      const errorRecord = readObjectRecord(error);
      this.logger.error(`${this.logContext} accepted chat turn failed`, {
        attempt,
        attempts,
        errorCode: readString(errorRecord?.code),
        errorMessage:
          error instanceof Error ? error.message : 'Unknown agent run error',
        errorName: error instanceof Error ? error.name : undefined,
        organizationId: data.organizationId,
        runId: data.runId,
        threadId: data.threadId,
      });
      if (isLastAttempt) {
        const persistedError =
          'Agent generation could not be completed after durable retries.';
        await this.agentRunsService.fail(
          data.runId,
          data.organizationId,
          persistedError,
        );
        await this.agentStreamPublisherService.publishError({
          error: 'Agent generation could not be completed. Please retry.',
          runId: data.runId,
          threadId: data.threadId,
          userId: data.userId,
        });
        this.agentStreamPublisherService.publishRunComplete({
          error: persistedError,
          organizationId: data.organizationId,
          runId: data.runId,
          status: 'failed',
          timestamp: new Date().toISOString(),
          userId: data.userId,
        });
      }
      throw error;
    }

    this.logger.log(`${this.logContext} accepted chat turn completed`, {
      clientRequestId: data.clientRequestId,
      organizationId: data.organizationId,
      runId: data.runId,
      threadId: data.threadId,
    });
  }

  private async processVoiceGeneration(data: AgentRunJobData): Promise<void> {
    if (!data.voiceRequest) {
      throw new Error(`Voice generation ${data.runId} has incomplete job data`);
    }
    await this.voiceGenerationService.executeQueuedGeneration({
      ...data.voiceRequest,
      organizationId: data.organizationId,
      userId: data.userId,
    });
  }
}
