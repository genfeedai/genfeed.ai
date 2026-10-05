/**
 * Emitted after a workflow execution settles into a terminal status
 * (completed, failed or cancelled). Payload: `WorkflowExecutionTerminalEvent`.
 */
export const WORKFLOW_EXECUTION_TERMINAL_EVENT = 'workflow.execution.terminal';

export interface WorkflowExecutionTerminalEvent {
  executionId: string;
  organizationId: string;
  status: 'cancelled' | 'completed' | 'failed';
}
