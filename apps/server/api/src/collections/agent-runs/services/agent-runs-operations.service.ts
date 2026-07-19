import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface AgentRunOperationScope {
  brandId?: string;
  organizationId: string;
  userId: string;
}

type LegacyPopulatedThreadReference = {
  id?: unknown;
};

@Injectable()
export class AgentRunsOperationsService {
  constructor(
    private readonly agentRunsService: AgentRunsService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
    @Optional()
    private readonly agentRunQueueService?: AgentRunQueueService,
  ) {}

  async cancelRun(id: string, scope: AgentRunOperationScope) {
    const run = await this.agentRunsService.cancel(
      id,
      scope.organizationId,
      scope.brandId,
    );

    if (!run) {
      throw new NotFoundException('Agent run');
    }

    const threadId = this.resolveThreadId(run);
    if (threadId) {
      try {
        await this.agentThreadEngineService?.appendEvent({
          commandId: `run-cancelled:${id}`,
          organizationId: scope.organizationId,
          payload: {
            detail: 'The active run was cancelled by the user.',
            label: 'Run cancelled',
            status: 'cancelled',
          },
          runId: id,
          threadId,
          type: 'run.cancelled',
          userId: scope.userId,
        });
      } catch (error) {
        // The cancellation already succeeded; thread provenance is best-effort.
        this.loggerService.warn('Failed to append run.cancelled thread event', {
          error: (error as Error)?.message,
          runId: id,
          threadId,
        });
      }
    }

    return run;
  }

  async retryRun(id: string, scope: AgentRunOperationScope) {
    if (!this.agentRunQueueService) {
      throw new ServiceUnavailableException('Agent run queue is unavailable');
    }

    const preparation = await this.agentRunsService.prepareRetry(
      id,
      scope.organizationId,
      {
        brandId: scope.brandId,
        retriedBy: scope.userId,
      },
    );

    if (!preparation) {
      throw new NotFoundException('Agent run');
    }

    const { jobData, rollback, run } = preparation;

    try {
      await this.agentRunQueueService.queueRun(jobData);
    } catch (error) {
      try {
        const isRestored = await this.agentRunsService.rollbackRetry(
          id,
          scope.organizationId,
          rollback,
          scope.brandId,
        );
        if (!isRestored) {
          this.loggerService.warn('Agent run retry rollback was not applied', {
            runId: id,
          });
        }
      } catch (rollbackError) {
        this.loggerService.warn('Failed to roll back agent run retry', {
          error: (rollbackError as Error)?.message,
          runId: id,
        });
      }
      throw error;
    }

    const threadId = this.resolveThreadId(run);
    if (threadId) {
      try {
        await this.agentThreadEngineService?.appendEvent({
          commandId: `run-retried:${id}:${run.retryCount ?? 0}`,
          organizationId: scope.organizationId,
          payload: {
            detail: 'The run was requeued for retry by the user.',
            label: 'Run retried',
            status: 'pending',
          },
          runId: id,
          threadId,
          type: 'run.retried',
          userId: scope.userId,
        });
      } catch (error) {
        // The retry already succeeded; thread provenance is best-effort.
        this.loggerService.warn('Failed to append run.retried thread event', {
          error: (error as Error)?.message,
          runId: id,
          threadId,
        });
      }
    }

    return run;
  }

  private resolveThreadId(
    run: Pick<AgentRunDocument, 'thread' | 'threadId'>,
  ): string | undefined {
    const populatedThread = run.thread as
      | LegacyPopulatedThreadReference
      | undefined;
    return (
      run.threadId?.toString() ??
      populatedThread?.id?.toString() ??
      populatedThread?.toString()
    );
  }
}
