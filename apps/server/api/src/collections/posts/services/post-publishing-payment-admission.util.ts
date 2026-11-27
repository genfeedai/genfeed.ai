import { readIsNeverPaid } from '@api/collections/credits/services/free-trial-state.util';
import { assertStrategyCadenceAdmission } from '@api/collections/posts/services/post-strategy-cadence-admission.util';
import { PublishingPaymentRequiredException } from '@api/exceptions/business-logic.exception';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

type PublishingPaymentClient = Pick<Prisma.TransactionClient, 'organization'>;

const PUBLISH_INTENT_STATES: readonly string[] = [
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PUBLISHING,
];

/** A root post headed for a channel: scheduled, or being published now. */
function requiresPublishingPaymentAdmission(
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
export const assertPublishingPaymentAdmission = traced(
  'assertPublishingPaymentAdmission',
  async (
    client: PublishingPaymentClient,
    candidate: Readonly<Record<string, unknown>>,
  ): Promise<void> => {
    if (!requiresPublishingPaymentAdmission(candidate)) return;
    const organizationId =
      typeof candidate.organizationId === 'string'
        ? candidate.organizationId
        : '';
    if (await readIsNeverPaid(client, organizationId)) {
      throw new PublishingPaymentRequiredException();
    }
  },
);

/**
 * The admissions a post lifecycle transition into SCHEDULED or PUBLISHING
 * runs: the strategy cadence, then the first payment. Only a new intent to
 * publish is held to the payment: a target already scheduled or in flight
 * keeps moving, and the worker refuses an unpaid delivery itself.
 */
export const assertPublishIntentAdmission = traced(
  'assertPublishIntentAdmission',
  async (
    tx: Prisma.TransactionClient,
    currentState: string,
    candidate: Readonly<Record<string, unknown>>,
  ): Promise<void> => {
    await assertStrategyCadenceAdmission(tx, candidate);
    if (PUBLISH_INTENT_STATES.includes(currentState)) return;
    await assertPublishingPaymentAdmission(tx, candidate);
  },
);
