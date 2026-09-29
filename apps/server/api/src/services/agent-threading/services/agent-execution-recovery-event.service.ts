import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type AgentExecutionRecoveryOutcome =
  | { error: string; type: 'failed' }
  | { type: 'cancelled' };

/**
 * Records the terminal thread event for an agent turn that recovery ends
 * through its `WorkflowExecution` alone (a turn no worker ever started, a job
 * the deploy drain removed). Such a turn produces no thread event of its own,
 * so without this the thread's projected run status never moves and no status
 * push (#5636) fires.
 *
 * Call it BEFORE the execution is closed: the status derivation lets a
 * terminal execution override a live snapshot, so once the execution is
 * terminal the event no longer changes the derived state and nothing is
 * published. The command ids match the orchestrator's own terminal events, so
 * a run that already recorded its failure is not recorded twice.
 */
@Injectable()
export class AgentExecutionRecoveryEventService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentThreadEngineService: AgentThreadEngineService,
    private readonly loggerService: LoggerService,
  ) {}

  /** Best-effort: recovery must go on closing the execution if this fails. */
  async recordExecutionEnded(
    executionId: string,
    outcome: AgentExecutionRecoveryOutcome,
  ): Promise<void> {
    try {
      // tenant-scope-ignore: recovery addresses an execution by its opaque globally unique id; this read resolves its tenant and every write below is scoped to it
      const execution = await this.prisma.workflowExecution.findUnique({
        select: { organizationId: true, result: true },
        where: { id: executionId },
      });
      const threadId = this.readThreadId(execution?.result);
      if (!execution || !threadId) {
        return;
      }

      const thread = await this.agentThreadsService.findOne({
        id: threadId,
        isDeleted: false,
        organizationId: execution.organizationId,
      });
      if (!thread?.userId) {
        return;
      }

      const isFailure = outcome.type === 'failed';
      await this.agentThreadEngineService.appendEvent({
        commandId: `${isFailure ? 'run-failed' : 'run-cancelled'}:${threadId}:${executionId}`,
        metadata: { origin: 'execution-recovery' },
        organizationId: execution.organizationId,
        payload: isFailure
          ? { error: outcome.error, label: 'Agent failed', status: 'failed' }
          : { label: 'Agent cancelled', status: 'cancelled' },
        runId: executionId,
        threadId,
        type: isFailure ? 'run.failed' : 'run.cancelled',
        userId: String(thread.userId),
      });
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} failed to record the ended run`,
        {
          error: error instanceof Error ? error.message : String(error),
          executionId,
        },
      );
    }
  }

  /** Agent turns record their thread in the execution result metadata. */
  private readThreadId(result: unknown): string | undefined {
    const metadata =
      result && typeof result === 'object'
        ? (result as { metadata?: unknown }).metadata
        : undefined;
    const threadId =
      metadata && typeof metadata === 'object'
        ? (metadata as { threadId?: unknown }).threadId
        : undefined;
    return typeof threadId === 'string' && threadId.length > 0
      ? threadId
      : undefined;
  }
}
