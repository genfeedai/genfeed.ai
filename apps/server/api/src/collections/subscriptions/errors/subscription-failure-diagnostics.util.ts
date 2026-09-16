import {
  classifyStripeFailure,
  getStripeErrorCode,
  getStripeRequestId,
  getStripeStatusCode,
  isStripeError,
  type SubscriptionFailureCategory,
} from '@api/collections/subscriptions/errors/stripe-failure-reader.util';
import type { SubscriptionBillingException } from '@api/collections/subscriptions/errors/subscription-billing.exception';
import type { SubscriptionFailureCode } from '@genfeedai/contracts/interfaces/billing';

/**
 * Safe, structured context for logs and error tracking. Deliberately excludes
 * the Stripe message, `raw` payload, headers, and any secret-bearing field.
 */
export type SubscriptionFailureDiagnostics<TStage extends string = string> = {
  category: SubscriptionFailureCategory;
  code: SubscriptionFailureCode;
  errorName: string;
  isRetryable: boolean;
  stage?: TStage;
  stripeCode?: string;
  stripeRequestId?: string;
  stripeStatusCode?: number;
};

function categoryOf(
  exception: SubscriptionBillingException,
  isUnclassified: boolean,
): SubscriptionFailureCategory {
  const { cause } = exception;
  if (isStripeError(cause)) {
    return classifyStripeFailure(cause);
  }
  // Only an endpoint's catch-all code means "we do not know what this was";
  // every other code was reached by a check we wrote, so the cause is our
  // own state.
  return isUnclassified ? 'unknown' : 'local_state';
}

export function buildSubscriptionFailureDiagnostics<
  TStage extends string,
>(input: {
  /** True when the exception carries its endpoint's catch-all code. */
  isUnclassified: boolean;
  exception: SubscriptionBillingException;
  stage?: TStage;
}): SubscriptionFailureDiagnostics<TStage> {
  const { exception, isUnclassified, stage } = input;
  const { cause } = exception;
  const stripeCode = getStripeErrorCode(cause);
  const stripeRequestId = getStripeRequestId(cause);
  const stripeStatusCode = getStripeStatusCode(cause);

  return {
    category: categoryOf(exception, isUnclassified),
    code: exception.code,
    errorName: cause instanceof Error ? cause.name : exception.name,
    isRetryable: exception.isRetryable,
    ...(stage === undefined ? {} : { stage }),
    ...(stripeCode === undefined ? {} : { stripeCode }),
    ...(stripeRequestId === undefined ? {} : { stripeRequestId }),
    ...(stripeStatusCode === undefined ? {} : { stripeStatusCode }),
  };
}
