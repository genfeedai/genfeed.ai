import { PublishApprovalStatus } from '@genfeedai/contracts';

/** Raised when a claim finds the approval neither queued nor claimed by a run. */
const PUBLISH_APPROVAL_NOT_QUEUED_MESSAGE = 'Publish approval is not queued.';

/**
 * Raised when a claim loses the queued-to-executing swap to another run: the
 * approval is executing under that run's lease, or it already published.
 */
export const PUBLISH_APPROVAL_CLAIMED_BY_ANOTHER_RUN_MESSAGE =
  'Publish approval is already claimed by another run.';

/** The message for a claim whose queued-to-executing swap matched no row. */
export function describeLostPublishClaim(currentStatus: string): string {
  return currentStatus === PublishApprovalStatus.EXECUTING ||
    currentStatus === PublishApprovalStatus.PUBLISHED
    ? PUBLISH_APPROVAL_CLAIMED_BY_ANOTHER_RUN_MESSAGE
    : PUBLISH_APPROVAL_NOT_QUEUED_MESSAGE;
}

/**
 * Why a status transition was refused. Queueing is the first step of a
 * scheduled run's claim, so an approval a duplicate run already claimed or
 * published reads as that claim and not as an invalid transition.
 */
export function describeRejectedTransition(
  from: PublishApprovalStatus,
  next: PublishApprovalStatus,
): string {
  return next === PublishApprovalStatus.QUEUED
    ? describeLostPublishClaim(from)
    : `Publish approval cannot transition from ${from} to ${next}.`;
}

/**
 * Why a status write matched no row. `latestStatus` is the status read back when
 * the write was queueing: a duplicate run that claimed or published it in
 * between is a lost claim; any other status keeps the generic message.
 */
export function describeLostTransition(
  from: PublishApprovalStatus,
  latestStatus: string | undefined,
): string {
  return latestStatus === PublishApprovalStatus.EXECUTING ||
    latestStatus === PublishApprovalStatus.PUBLISHED
    ? PUBLISH_APPROVAL_CLAIMED_BY_ANOTHER_RUN_MESSAGE
    : `Publish approval changed concurrently; expected status ${from}.`;
}
