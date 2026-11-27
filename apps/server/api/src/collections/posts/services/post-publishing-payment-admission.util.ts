import { readIsNeverPaid } from '@api/collections/credits/services/free-trial-state.util';
import { PublishingPaymentRequiredException } from '@api/exceptions/business-logic.exception';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

type PublishingPaymentClient = Pick<Prisma.TransactionClient, 'organization'>;

const PUBLISH_INTENT_STATES: readonly string[] = [
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PUBLISHING,
];

/** A root post headed for a channel: scheduled, or being published now. */
export function requiresPublishingPaymentAdmission(
  candidate: Readonly<Record<string, unknown>>,
): boolean {
  return (
    !candidate.parentId &&
    PUBLISH_INTENT_STATES.includes(String(candidate.targetExecutionState))
  );
}

/**
 * Refuses to schedule or publish a post for an organization that never paid.
 * Genfeed Cloud has no free tier: the onboarding drafts stay readable and
 * editable, and the first payment (a plan or a credit pack) unlocks
 * publishing. Every write that moves a post to SCHEDULED or PUBLISHING runs
 * this beside the strategy cadence admission, so no path (the app, the API,
 * an agent or MCP) skips it. Thread children follow their root.
 */
export async function assertPublishingPaymentAdmission(
  client: PublishingPaymentClient,
  candidate: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (!requiresPublishingPaymentAdmission(candidate)) return;
  const organizationId =
    typeof candidate.organizationId === 'string'
      ? candidate.organizationId
      : '';
  if (await readIsNeverPaid(client, organizationId)) {
    throw new PublishingPaymentRequiredException();
  }
}
