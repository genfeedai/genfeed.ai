import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  resolveNestedActionOrigin,
  runWithActionOrigin,
  sanitizeActionOriginContext,
  scopedWhere,
} from '@api/index';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import type { TurboRunConfig } from '@api/services/turbo-run/turbo-run.types';
import { TurboRunAlreadyOwnedException } from '@api/services/turbo-run/turbo-run-already-owned.exception';
import { TurboRunCreditsService } from '@api/services/turbo-run/turbo-run-credits.service';
import { TurboRunStreamService } from '@api/services/turbo-run/turbo-run-stream.service';
import {
  buildTurboRunWorkflowDefinition,
  TURBO_RUN_ACTION_IDS,
} from '@api/services/turbo-run/turbo-run-workflow-definition';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin } from '@genfeedai/contracts';
import type { TurboRunWorkflowInput } from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export function turboRunJobId(turboRunId: string): string {
  return `turbo-run-${turboRunId}`;
}

@Injectable()
export class TurboRunWorkflowService implements OnModuleInit {
  private readonly logContext = 'TurboRunWorkflowService';

  constructor(
    private readonly turboRuns: TurboRunService,
    private readonly credits: TurboRunCreditsService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly streams: TurboRunStreamService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(TURBO_RUN_ACTION_IDS.MARK_QUEUED, ({ input }) =>
      this.markQueued(input.request as TurboRunWorkflowInput),
    );
    this.runner.registerAction(TURBO_RUN_ACTION_IDS.PROCESS, ({ input }) =>
      this.process(input.request as TurboRunWorkflowInput),
    );
    this.runner.registerAction(TURBO_RUN_ACTION_IDS.SETTLE, ({ input }) =>
      this.settle(input.request as TurboRunWorkflowInput),
    );
    this.runner.registerWorkflow(buildTurboRunWorkflowDefinition());
  }

  /**
   * `dispatchClass` is threaded from the caller rather than hard-coded here:
   * this producer serves both a live "generate run" click/agent tool call
   * (INTERACTIVE — `TurboRunController`, `AgentMediaTurboRunService`)
   * and a cron reconcile retrying a stuck run (BACKGROUND —
   * `CronTurboRunReconcileService`) — see #5271.
   */
  queueTurboRun(
    request: TurboRunWorkflowInput,
    dispatchClass: SystemWorkflowDispatchClass,
  ): Promise<string> {
    const definition = buildTurboRunWorkflowDefinition();
    const actionContext = sanitizeActionOriginContext(
      request.actionContext ?? resolveNestedActionOrigin(ActionOrigin.AGENT),
    );
    return runWithActionOrigin(actionContext, () =>
      this.queue.queueSystemWorkflow(
        {
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          inputValues: { request: { ...request, actionContext } },
          organizationId: request.organizationId,
          source: 'turbo-run',
          userId: request.userId,
        },
        turboRunJobId(request.turboRunId),
        {
          attempts: 1,
          dispatchClass,
        },
      ),
    );
  }

  private async markQueued(
    request: TurboRunWorkflowInput,
  ): Promise<{ queued: boolean }> {
    const turboRun = await this.prisma.turboRun.findFirst({
      select: { config: true },
      where: scopedWhere(request.organizationId, { id: request.turboRunId }),
    });
    if (!turboRun) return { queued: false };
    const config = (turboRun.config ?? {}) as TurboRunConfig;
    const queuedConfig: TurboRunConfig = {
      ...config,
      queuedAt: new Date().toISOString(),
    };
    await this.prisma.turboRun.updateMany({
      data: { config: queuedConfig as Prisma.InputJsonValue },
      where: scopedWhere(request.organizationId, { id: request.turboRunId }),
    });
    return { queued: true };
  }

  private async process(
    request: TurboRunWorkflowInput,
  ): Promise<Record<string, unknown>> {
    const streamOptions =
      request.threadId && request.userId
        ? this.streams.buildProcessOptions({
            turboRunId: request.turboRunId,
            runId: request.runId,
            threadId: request.threadId,
            userId: request.userId,
          })
        : undefined;
    try {
      const summary = await runWithActionOrigin(
        request.actionContext ?? { origin: ActionOrigin.AGENT },
        () =>
          this.turboRuns.processTurboRun(
            request.turboRunId,
            request.organizationId,
            streamOptions,
          ),
      );
      return { ...summary, ownedElsewhere: false };
    } catch (error: unknown) {
      if (error instanceof TurboRunAlreadyOwnedException) {
        this.logger.warn(`${this.logContext} run already owned`, {
          turboRunId: request.turboRunId,
        });
        return { ownedElsewhere: true };
      }
      throw error;
    }
  }

  private async settle(
    request: TurboRunWorkflowInput,
  ): Promise<{ settled: boolean }> {
    try {
      await this.credits.settleTurboRunCredits({
        turboRunId: request.turboRunId,
        organizationId: request.organizationId,
        userId: request.userId,
      });
      return { settled: true };
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} settlement failed`, error, {
        turboRunId: request.turboRunId,
      });
      return { settled: false };
    }
  }
}
