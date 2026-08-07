import { BatchStatus } from '@genfeedai/enums';

/**
 * `batch_workflow_jobs.status` is a Prisma `BatchStatus` column, so the wire
 * value is SCREAMING_SNAKE. Comparing it against lowercase literals silently
 * never matches, which leaves batch polling running forever.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
const TERMINAL_BATCH_STATUSES: ReadonlySet<BatchStatus> = new Set([
  BatchStatus.COMPLETED,
  BatchStatus.PARTIAL,
  BatchStatus.FAILED,
  BatchStatus.CANCELLED,
]);

/** A batch job in a terminal status will not change again — stop polling it. */
export function isTerminalBatchStatus(status: BatchStatus): boolean {
  return TERMINAL_BATCH_STATUSES.has(status);
}
