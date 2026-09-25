import {
  type PaidSubscriptionSnapshot,
  resolveOrganizationPaidGrant,
} from '@api/common/subscriptions/paid-subscription-access.util';

/**
 * Server-side paid research decision. Callers must not consult API-key,
 * trial, or BYOK session flags — those do not grant hosted collection.
 */
export type ResearchAccessReason =
  | 'active_paid'
  | 'paid_through'
  | 'research_paid_access_required'
  | 'research_subscription_unverified'
  | 'self_hosted';

export interface ResearchAccessDecision {
  isAllowed: boolean;
  reason: ResearchAccessReason;
}

export interface ResearchAccessInput {
  isHostedSaas: boolean;
  now: Date;
  subscriptionReadFailed: boolean;
  /** Non-deleted organization subscriptions. Empty when none exist. */
  subscriptions: readonly PaidSubscriptionSnapshot[];
  subscriptionTier: string | null;
}

/**
 * Hosted SaaS collection requires an active paid subscription, or a
 * cancellation that is still inside the paid period. Self-hosted installs
 * do not use this subscription policy. A failed subscription read fails closed.
 */
export function resolveResearchCollectionAccess(
  input: ResearchAccessInput,
): ResearchAccessDecision {
  if (!input.isHostedSaas) {
    return { isAllowed: true, reason: 'self_hosted' };
  }
  if (input.subscriptionReadFailed) {
    return { isAllowed: false, reason: 'research_subscription_unverified' };
  }
  const grant = resolveOrganizationPaidGrant(
    input.subscriptions,
    input.subscriptionTier,
    input.now,
  );
  if (grant) return { isAllowed: true, reason: grant };
  return { isAllowed: false, reason: 'research_paid_access_required' };
}
