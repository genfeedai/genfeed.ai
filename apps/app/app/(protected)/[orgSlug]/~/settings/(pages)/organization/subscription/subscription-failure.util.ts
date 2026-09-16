import {
  type ISubscriptionFailureView,
  SubscriptionChangeFailureCode,
  type SubscriptionFailureCode,
  SubscriptionPreviewFailureCode,
} from '@genfeedai/contracts/interfaces/billing';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMetaBoolean,
  getJsonApiErrorMetaNumber,
} from '@services/core/json-api-error-message';

const FAILURE_KEY_PREFIX = 'subscription.plans.failures';

/** Shown when the API returned no code we recognise. */
export const SUBSCRIPTION_FAILURE_FALLBACK_KEY = `${FAILURE_KEY_PREFIX}.generic`;

/**
 * Catalog key per public failure code. The preview and plan-change endpoints
 * deliberately spell their shared causes the same way, so one entry serves
 * both; codes unique to one endpoint simply never arrive from the other.
 */
const MESSAGE_KEY_BY_CODE: Record<SubscriptionFailureCode, string> = {
  [SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISMATCH]: `${FAILURE_KEY_PREFIX}.billingCustomerMismatch`,
  [SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING]: `${FAILURE_KEY_PREFIX}.billingCustomerMissing`,
  [SubscriptionPreviewFailureCode.BILLING_PROVIDER_REJECTED]: `${FAILURE_KEY_PREFIX}.billingProviderRejected`,
  [SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE]: `${FAILURE_KEY_PREFIX}.billingProviderUnavailable`,
  [SubscriptionPreviewFailureCode.CURRENT_PRICE_MISSING]: `${FAILURE_KEY_PREFIX}.currentPriceMissing`,
  [SubscriptionPreviewFailureCode.ORGANIZATION_REQUIRED]: `${FAILURE_KEY_PREFIX}.organizationRequired`,
  [SubscriptionPreviewFailureCode.PREVIEW_FAILED]: `${FAILURE_KEY_PREFIX}.generic`,
  [SubscriptionPreviewFailureCode.PREVIEW_REJECTED]: `${FAILURE_KEY_PREFIX}.previewRejected`,
  [SubscriptionPreviewFailureCode.PRICE_NOT_FOUND]: `${FAILURE_KEY_PREFIX}.priceNotFound`,
  [SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING]: `${FAILURE_KEY_PREFIX}.stripeSubscriptionMissing`,
  [SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_OUT_OF_SYNC]: `${FAILURE_KEY_PREFIX}.stripeSubscriptionOutOfSync`,
  [SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING]: `${FAILURE_KEY_PREFIX}.subscriptionMissing`,
  [SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED]: `${FAILURE_KEY_PREFIX}.generic`,
  [SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED]: `${FAILURE_KEY_PREFIX}.planChangeNotRecorded`,
  [SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED]: `${FAILURE_KEY_PREFIX}.planChangeRejected`,
  [SubscriptionChangeFailureCode.PLAN_CREDITS_NOT_RESET]: `${FAILURE_KEY_PREFIX}.planCreditsNotReset`,
  [SubscriptionChangeFailureCode.PLAN_INTERVAL_UNSUPPORTED]: `${FAILURE_KEY_PREFIX}.planIntervalUnsupported`,
};

function isKnownCode(
  code: string | undefined,
): code is SubscriptionFailureCode {
  return code !== undefined && code in MESSAGE_KEY_BY_CODE;
}

/** Keeps whole counts above zero; anything else is not a usable budget. */
function asPositiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

/**
 * Reads the retry allowance the API granted, one named primitive at a time so
 * nothing else in `meta` is ever read. Absent unless the failure is flagged
 * retryable with a positive attempt budget, so an unrecognised or hostile
 * `meta` can never talk the client into retrying.
 */
function readRetry(error: unknown): ISubscriptionFailureView['retry'] {
  if (getJsonApiErrorMetaBoolean(error, 'isRetryable') !== true) {
    return undefined;
  }

  const maxAttempts = asPositiveInteger(
    getJsonApiErrorMetaNumber(error, 'maxRetries'),
  );
  if (maxAttempts === undefined) {
    return undefined;
  }

  const retryAfterSeconds =
    asPositiveInteger(getJsonApiErrorMetaNumber(error, 'retryAfterSeconds')) ??
    0;

  return {
    maxAttempts,
    notBeforeMs: Date.now() + retryAfterSeconds * 1000,
  };
}

/**
 * Turns a failed subscription billing call into the message to show and the
 * retry the API allows. An error with no recognised code falls back to the
 * generic message and offers no retry.
 */
export function getSubscriptionFailureView(
  error: unknown,
): ISubscriptionFailureView {
  const member = getJsonApiErrorMember(error);
  const code = member?.code;

  if (!isKnownCode(code)) {
    return { messageKey: SUBSCRIPTION_FAILURE_FALLBACK_KEY };
  }

  const retry = readRetry(error);

  return {
    code,
    messageKey: MESSAGE_KEY_BY_CODE[code],
    ...(retry === undefined ? {} : { retry }),
  };
}
