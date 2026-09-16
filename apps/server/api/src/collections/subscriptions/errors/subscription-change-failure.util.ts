import {
  classifyStripeFailure,
  getStripeErrorParam,
  isNonTransientStripeErrorType,
  isStripeError,
  isStripeServerFault,
} from '@api/collections/subscriptions/errors/stripe-failure-reader.util';
import { SubscriptionChangeException } from '@api/collections/subscriptions/errors/subscription-change.exception';
import {
  buildSubscriptionFailureDiagnostics,
  type SubscriptionFailureDiagnostics,
} from '@api/collections/subscriptions/errors/subscription-failure-diagnostics.util';
import { SubscriptionChangeFailureCode } from '@genfeedai/contracts/interfaces/billing';
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Where a plan change was when it failed. The boundary that matters is
 * `PLAN_CHANGE`: before it nothing has moved, after it the provider already
 * bills the new price.
 */
export const SubscriptionChangeStage = {
  /** Resetting the credit allocation, after the change is durable. */
  CREDITS: 'credits',
  /** `StripeService.changeSubscriptionPlan`: the provider mutation itself. */
  PLAN_CHANGE: 'plan_change',
  /** `StripeService.getPrice` for the requested price. */
  PRICE: 'price',
  /** Writing the changed plan to our own row, after the provider applied it. */
  RECORD: 'record',
} as const;

export type SubscriptionChangeStage =
  (typeof SubscriptionChangeStage)[keyof typeof SubscriptionChangeStage];

export type SubscriptionChangeFailureDiagnostics =
  SubscriptionFailureDiagnostics<SubscriptionChangeStage>;

/**
 * A Stripe `resource_missing` names the offending param, which separates a
 * price we can no longer sell from a subscription that is gone upstream.
 */
function classifyResourceMissing(
  error: unknown,
  stage: SubscriptionChangeStage,
): SubscriptionChangeFailureCode {
  if (stage === SubscriptionChangeStage.PRICE) {
    return SubscriptionChangeFailureCode.PRICE_NOT_FOUND;
  }
  const param = getStripeErrorParam(error) ?? '';
  if (param.includes('price')) {
    return SubscriptionChangeFailureCode.PRICE_NOT_FOUND;
  }
  return SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING;
}

function classifyStripeApiError(
  error: unknown,
  stage: SubscriptionChangeStage,
): SubscriptionChangeFailureCode {
  const category = classifyStripeFailure(error);
  if (category === 'customer_missing') {
    return classifyResourceMissing(error, stage);
  }
  if (category === 'provider_unavailable' || isStripeServerFault(error)) {
    return SubscriptionChangeFailureCode.BILLING_PROVIDER_UNAVAILABLE;
  }
  if (category === 'configuration' || isNonTransientStripeErrorType(error)) {
    return SubscriptionChangeFailureCode.BILLING_PROVIDER_REJECTED;
  }
  // StripeInvalidRequestError / StripeCardError: Stripe understood the change
  // and refused to apply it.
  return SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED;
}

/**
 * Turn whatever escaped a plan-change step into one stable typed exception.
 *
 * Stage decides the verdict once the provider has already moved: anything
 * thrown while recording the change locally is a divergence between billing
 * and our record, never a plain fault, because the customer is now billed on
 * a price our row does not carry.
 */
export function toSubscriptionChangeException(
  error: unknown,
  stage?: SubscriptionChangeStage,
): SubscriptionChangeException {
  if (error instanceof SubscriptionChangeException) {
    return error;
  }
  if (stage === SubscriptionChangeStage.RECORD) {
    return new SubscriptionChangeException(
      SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED,
      error,
    );
  }
  if (stage === SubscriptionChangeStage.CREDITS) {
    return new SubscriptionChangeException(
      SubscriptionChangeFailureCode.PLAN_CREDITS_NOT_RESET,
      error,
    );
  }
  if (stage !== undefined && isStripeError(error)) {
    return new SubscriptionChangeException(
      classifyStripeApiError(error, stage),
      error,
    );
  }
  if (
    error instanceof HttpException &&
    error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
  ) {
    return new SubscriptionChangeException(
      SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED,
      error,
    );
  }
  return new SubscriptionChangeException(
    SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED,
    error,
  );
}

export function getSubscriptionChangeFailureDiagnostics(
  exception: SubscriptionChangeException,
  stage?: SubscriptionChangeStage,
): SubscriptionChangeFailureDiagnostics {
  return buildSubscriptionFailureDiagnostics({
    exception,
    isUnclassified:
      exception.code === SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED,
    stage,
  });
}
