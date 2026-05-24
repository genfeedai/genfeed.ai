/**
 * @genfeedai/ee-billing — Enterprise billing package.
 *
 * Layer 1: Service contracts re-exported from @genfeedai/interfaces/billing.
 * Layer 2: Subscription collections moved from apps/server/api/src/.
 *
 * See ./EE-EXTRACTION.md for the full move plan (issue #87).
 */

export type {
  ICreditsUtilsService,
  ISubscriptionFindOneFilter,
  ISubscriptionsService,
} from '@genfeedai/interfaces/billing';
export * from './subscription-attributions/index';
export * from './subscriptions/index';
export * from './user-subscriptions/index';
