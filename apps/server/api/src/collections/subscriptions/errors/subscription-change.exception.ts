import { SubscriptionBillingException } from '@api/collections/subscriptions/errors/subscription-billing.exception';
import { SubscriptionChangeFailureCode } from '@genfeedai/contracts/interfaces/billing';
import { HttpStatus } from '@nestjs/common';

const SUBSCRIPTION_CHANGE_TITLE = 'Subscription plan change failed';

const STATUS_BY_CODE: Record<SubscriptionChangeFailureCode, HttpStatus> = {
  [SubscriptionChangeFailureCode.BILLING_PROVIDER_REJECTED]:
    HttpStatus.BAD_GATEWAY,
  [SubscriptionChangeFailureCode.BILLING_PROVIDER_UNAVAILABLE]:
    HttpStatus.SERVICE_UNAVAILABLE,
  [SubscriptionChangeFailureCode.ORGANIZATION_REQUIRED]: HttpStatus.BAD_REQUEST,
  [SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED]:
    HttpStatus.INTERNAL_SERVER_ERROR,
  [SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED]:
    HttpStatus.INTERNAL_SERVER_ERROR,
  [SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED]:
    HttpStatus.UNPROCESSABLE_ENTITY,
  [SubscriptionChangeFailureCode.PLAN_CREDITS_NOT_RESET]:
    HttpStatus.INTERNAL_SERVER_ERROR,
  [SubscriptionChangeFailureCode.PLAN_INTERVAL_UNSUPPORTED]:
    HttpStatus.UNPROCESSABLE_ENTITY,
  [SubscriptionChangeFailureCode.PRICE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING]:
    HttpStatus.CONFLICT,
  [SubscriptionChangeFailureCode.SUBSCRIPTION_MISSING]: HttpStatus.NOT_FOUND,
};

// Public wording only: no Stripe ids, messages, or request metadata.
const DETAIL_BY_CODE: Record<SubscriptionChangeFailureCode, string> = {
  [SubscriptionChangeFailureCode.BILLING_PROVIDER_REJECTED]:
    'The billing provider rejected the plan change',
  [SubscriptionChangeFailureCode.BILLING_PROVIDER_UNAVAILABLE]:
    'The billing provider is temporarily unavailable; retry shortly',
  [SubscriptionChangeFailureCode.ORGANIZATION_REQUIRED]:
    'An active organization is required to change a subscription plan',
  [SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED]:
    'Failed to change subscription plan',
  [SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED]:
    'The plan change reached the billing provider but could not be recorded; support has been notified',
  [SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED]:
    'The billing provider could not apply this plan change',
  [SubscriptionChangeFailureCode.PLAN_CREDITS_NOT_RESET]:
    'The plan changed but its credit allocation could not be reset',
  [SubscriptionChangeFailureCode.PLAN_INTERVAL_UNSUPPORTED]:
    'Subscription price must use a monthly or yearly billing interval',
  [SubscriptionChangeFailureCode.PRICE_NOT_FOUND]:
    'The requested plan price is not available',
  [SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING]:
    'The organization has no active billing subscription to change',
  [SubscriptionChangeFailureCode.SUBSCRIPTION_MISSING]:
    'No subscription exists for this organization',
};

/**
 * Only a provider outage is retryable. `PLAN_CHANGE_NOT_RECORDED` is a 5xx
 * that a retry cannot clear on its own — billing and our record disagree
 * until reconciled — so it is never advertised as transient.
 */
const RETRYABLE_CODES: ReadonlySet<SubscriptionChangeFailureCode> = new Set([
  SubscriptionChangeFailureCode.BILLING_PROVIDER_UNAVAILABLE,
]);

/** Typed, stable failure for `PATCH /subscriptions/current`. */
export class SubscriptionChangeException extends SubscriptionBillingException<SubscriptionChangeFailureCode> {
  constructor(code: SubscriptionChangeFailureCode, cause?: unknown) {
    super({
      cause,
      code,
      detail: DETAIL_BY_CODE[code],
      isRetryable: RETRYABLE_CODES.has(code),
      status: STATUS_BY_CODE[code],
      title: SUBSCRIPTION_CHANGE_TITLE,
    });

    this.name = 'SubscriptionChangeException';
  }
}
