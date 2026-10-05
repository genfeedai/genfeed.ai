import {
  WORKFLOW_EXECUTION_TERMINAL_EVENT,
  type WorkflowExecutionTerminalEvent,
} from '@api/collections/workflow-executions/constants/workflow-execution-events.constants';
import type { EventEmitter2 } from '@nestjs/event-emitter';

interface TerminalEventLogger {
  warn(message: string, context?: unknown): void;
}

/**
 * Announce a settled execution. Call it right after the terminal transition
 * commits, before billing or any other step that can throw: a retry sees the
 * execution already terminal and can never emit it. Emitting never throws.
 */
export function emitWorkflowExecutionTerminal(
  events: EventEmitter2 | undefined,
  logger: TerminalEventLogger | undefined,
  event: WorkflowExecutionTerminalEvent,
): void {
  try {
    events?.emit(WORKFLOW_EXECUTION_TERMINAL_EVENT, event);
  } catch (error: unknown) {
    logger?.warn('Failed to emit workflow execution terminal event', {
      error,
      executionId: event.executionId,
    });
  }
}
