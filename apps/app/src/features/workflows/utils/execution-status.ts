import { WorkflowExecutionStatus } from '@genfeedai/contracts';

/**
 * `workflow_executions.status` is a Prisma `WorkflowExecutionStatus` column, so
 * the wire value is SCREAMING_SNAKE. Comparing it against lowercase literals
 * silently never matches, which leaves execution polling running forever.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
const TERMINAL_EXECUTION_STATUSES: ReadonlySet<WorkflowExecutionStatus> =
  new Set([
    WorkflowExecutionStatus.CANCELLED,
    WorkflowExecutionStatus.COMPLETED,
    WorkflowExecutionStatus.FAILED,
  ]);

/** An execution in a terminal status will not change again — stop polling it. */
export function isTerminalExecutionStatus(
  status: WorkflowExecutionStatus,
): boolean {
  return TERMINAL_EXECUTION_STATUSES.has(status);
}
