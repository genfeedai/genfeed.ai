import { settleAgentTransferFromExecution } from '@api/collections/agent-transfers/services/agent-transfer-settlement.util';
import {
  WORKFLOW_EXECUTION_TERMINAL_EVENT,
  type WorkflowExecutionTerminalEvent,
} from '@api/collections/workflow-executions/constants/workflow-execution-events.constants';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Writes a child's result back to its transfer and to the master thread that
 * started it when the child's agent-turn execution settles (#8527). The
 * workflow-executions collection sits below transfers, so it emits rather
 * than calls. An execution with no transfer is ignored.
 */
@Injectable()
export class AgentTransferExecutionListener {
  private readonly context = { service: AgentTransferExecutionListener.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(WORKFLOW_EXECUTION_TERMINAL_EVENT)
  async handleExecutionTerminal(
    event: WorkflowExecutionTerminalEvent,
  ): Promise<void> {
    try {
      const transfer = await this.prisma.agentTransfer.findFirst({
        select: { id: true },
        where: scopedWhere(event.organizationId, {
          destinationExecutionId: event.executionId,
        }),
      });
      if (!transfer) {
        return;
      }
      const execution = await this.prisma.workflowExecution.findFirst({
        select: {
          completedAt: true,
          error: true,
          id: true,
          progress: true,
          result: true,
          startedAt: true,
          status: true,
        },
        where: scopedWhere(event.organizationId, { id: event.executionId }),
      });
      if (!execution) {
        return;
      }
      await settleAgentTransferFromExecution(this.prisma, {
        execution,
        organizationId: event.organizationId,
        transferId: transfer.id,
      });
    } catch (error: unknown) {
      this.logger.error('Failed to settle agent transfer for execution', {
        ...this.context,
        error,
        executionId: event.executionId,
        organizationId: event.organizationId,
      });
    }
  }
}
