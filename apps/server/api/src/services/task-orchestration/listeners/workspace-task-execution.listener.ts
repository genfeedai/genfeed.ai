import {
  WORKFLOW_EXECUTION_TERMINAL_EVENT,
  type WorkflowExecutionTerminalEvent,
} from '@api/collections/workflow-executions/constants/workflow-execution-events.constants';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Rolls a workspace task up when one of its linked executions finishes. The
 * workflow-executions collection sits below tasks, so it emits rather than
 * calls. Executions with no linked task are ignored by the orchestrator.
 */
@Injectable()
export class WorkspaceTaskExecutionListener {
  private readonly context = { service: WorkspaceTaskExecutionListener.name };

  constructor(
    private readonly taskOrchestrator: TaskOrchestratorService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(WORKFLOW_EXECUTION_TERMINAL_EVENT)
  async handleExecutionTerminal(
    event: WorkflowExecutionTerminalEvent,
  ): Promise<void> {
    try {
      await this.taskOrchestrator.handleExecutionCompletion(
        event.executionId,
        event.organizationId,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to roll up workspace task for execution', {
        ...this.context,
        error,
        executionId: event.executionId,
        organizationId: event.organizationId,
      });
    }
  }
}
