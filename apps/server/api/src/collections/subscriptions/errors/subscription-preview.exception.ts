import {
  type ISubscriptionPreviewFailureMeta,
  SubscriptionPreviewFailureCode,
} from '@genfeedai/contracts/interfaces/billing';
import { HttpException, HttpStatus } from '@nestjs/common';

/** Seconds a client should wait before its single bounded retry. */
export const SUBSCRIPTION_PREVIEW_RETRY_AFTER_SECONDS = 5;
/** Further attempts a client may make after a retryable failure. */
export const SUBSCRIPTION_PREVIEW_MAX_RETRIES = 1;

const SUBSCRIPTION_PREVIEW_TITLE = 'Subscription preview failed';

const STATUS_BY_CODE: Record<SubscriptionPreviewFailureCode, HttpStatus> = {
  [SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISMATCH]:
    HttpStatus.CONFLICT,
  [SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING]:
    HttpStatus.CONFLICT,
  [SubscriptionPreviewFailureCode.BILLING_PROVIDER_REJECTED]:
    HttpStatus.BAD_GATEWAY,
  [SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE]:
    HttpStatus.SERVICE_UNAVAILABLE,
  [SubscriptionPreviewFailureCode.CURRENT_PRICE_MISSING]: HttpStatus.CONFLICT,
  [SubscriptionPreviewFailureCode.ORGANIZATION_REQUIRED]:
    HttpStatus.BAD_REQUEST,
  [SubscriptionPreviewFailureCode.PREVIEW_FAILED]:
    HttpStatus.INTERNAL_SERVER_ERROR,
  [SubscriptionPreviewFailureCode.PREVIEW_REJECTED]:
    HttpStatus.UNPROCESSABLE_ENTITY,
  [SubscriptionPreviewFailureCode.PRICE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING]:
    HttpStatus.CONFLICT,
  [SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_OUT_OF_SYNC]:
    HttpStatus.CONFLICT,
  [SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING]: HttpStatus.NOT_FOUND,
};

// Public wording only: no Stripe ids, messages, or request metadata.
const DETAIL_BY_CODE: Record<SubscriptionPreviewFailureCode, string> = {
  [SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISMATCH]:
    'The billing subscription does not belong to this organization',
  [SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING]:
    'The organization has no billing customer to preview against',
  [SubscriptionPreviewFailureCode.BILLING_PROVIDER_REJECTED]:
    'The billing provider rejected the preview request',
  [SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE]:
    'The billing provider is temporarily unavailable; retry shortly',
  [SubscriptionPreviewFailureCode.CURRENT_PRICE_MISSING]:
    'The current subscription has no plan price on record',
  [SubscriptionPreviewFailureCode.ORGANIZATION_REQUIRED]:
    'An active organization is required to preview a subscription change',
  [SubscriptionPreviewFailureCode.PREVIEW_FAILED]: 'Failed to generate preview',
  [SubscriptionPreviewFailureCode.PREVIEW_REJECTED]:
    'The billing provider could not price this plan change',
  [SubscriptionPreviewFailureCode.PRICE_NOT_FOUND]:
    'The requested plan price is not available',
  [SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING]:
    'The organization has no active billing subscription to preview against',
  [SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_OUT_OF_SYNC]:
    'The billing subscription no longer matches the plan on record',
  [SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING]:
    'No subscription exists for this organization',
};

const RETRYABLE_CODES: ReadonlySet<SubscriptionPreviewFailureCode> = new Set([
  SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
]);

/**
 * Typed, stable failure for `POST /subscriptions/current/preview`. The
 * response body carries the public `code`, a safe `detail`, and a bounded
 * retry contract in `meta`; the original error stays on `cause` for error
 * tracking only and is never serialized.
 */
export class SubscriptionPreviewException extends HttpException {
  public readonly code: SubscriptionPreviewFailureCode;
  public readonly meta: ISubscriptionPreviewFailureMeta;

  constructor(code: SubscriptionPreviewFailureCode, cause?: unknown) {
    const status = STATUS_BY_CODE[code];
    const detail = DETAIL_BY_CODE[code];
    const isRetryable = RETRYABLE_CODES.has(code);
    const meta: ISubscriptionPreviewFailureMeta = {
      isRetryable,
      maxRetries: isRetryable ? SUBSCRIPTION_PREVIEW_MAX_RETRIES : 0,
      retryAfterSeconds: isRetryable
        ? SUBSCRIPTION_PREVIEW_RETRY_AFTER_SECONDS
        : null,
    };

    super(
      {
        code,
        detail,
        meta,
        status,
        title: SUBSCRIPTION_PREVIEW_TITLE,
      },
      status,
      cause === undefined ? undefined : { cause },
    );

    this.name = 'SubscriptionPreviewException';
    this.code = code;
    this.meta = meta;
    this.message = detail;
  }

  public get isRetryable(): boolean {
    return this.meta.isRetryable;
  }
}
