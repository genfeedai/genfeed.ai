import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Durable record of the deploy drain's intent to silently cancel a queued
 * execution (#5450). The drain writes it BEFORE removing the execution's
 * BullMQ job; if the database is unavailable right after the removal,
 * `PendingWorkflowExecutionReconcileService` reads it and finishes the silent
 * cancel later instead of loudly failing a run that was intentionally drained
 * (which would count as a strategy failure).
 *
 * Split out of `WorkflowExecutionsService`, which is at the file-size ratchet.
 */
@Injectable()
export class WorkflowExecutionCancellationIntentService {
  constructor(
    private readonly prisma: PrismaService,
    readonly logger: LoggerService,
  ) {}

  /**
   * Returns whether an intent was recorded; `false` means the execution is
   * missing or already terminal, so there is nothing left to cancel.
   */
  @HandleErrors('request execution cancellation', 'workflow-executions')
  async requestCancellation(executionId: string): Promise<boolean> {
    // tenant-scope-ignore: the internal drain records intent by the opaque globally unique execution id and has no request-level tenant boundary
    const existing = await this.prisma.workflowExecution.findUnique({
      select: { organizationId: true },
      where: { id: executionId },
    });
    if (!existing) {
      return false;
    }

    const recorded = await this.prisma.workflowExecution.updateMany({
      data: { cancelRequestedAt: new Date() },
      where: {
        id: executionId,
        isDeleted: false,
        organizationId: existing.organizationId,
        status: {
          in: [
            PrismaWorkflowExecutionStatus.PENDING,
            PrismaWorkflowExecutionStatus.RUNNING,
          ],
        },
      },
    });
    return recorded.count === 1;
  }

  /** Withdraws an intent recorded by `requestCancellation`. */
  @HandleErrors('clear execution cancellation request', 'workflow-executions')
  async clearCancellationRequest(executionId: string): Promise<void> {
    // tenant-scope-ignore: the internal drain clears intent by the opaque globally unique execution id and has no request-level tenant boundary
    const existing = await this.prisma.workflowExecution.findUnique({
      select: { organizationId: true },
      where: { id: executionId },
    });
    if (!existing) {
      return;
    }

    await this.prisma.workflowExecution.updateMany({
      data: { cancelRequestedAt: null },
      where: {
        cancelRequestedAt: { not: null },
        id: executionId,
        isDeleted: false,
        organizationId: existing.organizationId,
      },
    });
  }
}
