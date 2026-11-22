import { PublishApprovalStatus } from '@genfeedai/contracts';

/** Raised when a claim finds the approval neither queued nor claimed by a run. */
export const PUBLISH_APPROVAL_NOT_QUEUED_MESSAGE =
  'Publish approval is not queued.';

/**
 * Raised when a claim loses the queued-to-executing swap to another run: the
 * approval is executing under that run's lease, or it already published.
 */
export const PUBLISH_APPROVAL_CLAIMED_BY_ANOTHER_RUN_MESSAGE =
  'Publish approval is already claimed by another run.';

/** The message for a claim whose queued-to-executing swap matched no row. */
export function describeLostPublishClaim(
  currentStatus: PublishApprovalStatus,
): string {
  return currentStatus === PublishApprovalStatus.EXECUTING ||
    currentStatus === PublishApprovalStatus.PUBLISHED
    ? PUBLISH_APPROVAL_CLAIMED_BY_ANOTHER_RUN_MESSAGE
    : PUBLISH_APPROVAL_NOT_QUEUED_MESSAGE;
}
