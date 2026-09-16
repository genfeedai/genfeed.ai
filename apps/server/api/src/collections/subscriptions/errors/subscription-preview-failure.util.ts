import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import {
  classifyStripeFailure,
  getStripeErrorCode,
  type StripeFailureCategory,
} from '@api/services/integrations/stripe/services/stripe-error.util';
import {
  StripeUpcomingInvoiceError,
  StripeUpcomingInvoiceErrorCode,
} from '@api/services/integrations/stripe/services/stripe-upcoming-invoice.error';
import { SubscriptionPreviewFailureCode } from '@genfeedai/contracts/interfaces/billing';
import { HttpException, HttpStatus } from '@nestjs/common';

/** Which Stripe call the preview was in when it failed. */
export const SubscriptionPreviewStage = {
  /** `StripeService.getPrice` for the current or requested price. */
  PRICE: 'price',
  /** `StripeService.getUpcomingInvoice`: subscription retrieve + invoice preview. */
  UPCOMING_INVOICE: 'upcoming_invoice',
} as const;

export type SubscriptionPreviewStage =
  (typeof SubscriptionPreviewStage)[keyof typeof SubscriptionPreviewStage];

export type SubscriptionPreviewFailureCategory =
  | StripeFailureCategory
  | 'local_state'
  | 'unknown';

/**
 * Safe, structured context for logs and error tracking. Deliberately excludes
 * the Stripe message, `raw` payload, headers, and any secret-bearing field.
 */
export type SubscriptionPreviewFailureDiagnostics = {
  category: SubscriptionPreviewFailureCategory;
  code: SubscriptionPreviewFailureCode;
  errorName: string;
  isRetryable: boolean;
  stage?: SubscriptionPreviewStage;
  stripeCode?: string;
  stripeRequestId?: string;
  stripeStatusCode?: number;
};

type StripeLikeError = {
  param?: unknown;
  requestId?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

const NON_TRANSIENT_STRIPE_TYPES: ReadonlySet<string> = new Set([
  'StripeAPIError',
  'StripeAuthenticationError',
  'StripeIdempotencyError',
  'StripePermissionError',
]);

function asStripeLikeError(error: unknown): StripeLikeError | null {
  return error && typeof error === 'object' ? (error as StripeLikeError) : null;
}

function getStripeStatusCode(error: unknown): number | undefined {
  const statusCode = asStripeLikeError(error)?.statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

function getStripeErrorType(error: unknown): string | undefined {
  const type = asStripeLikeError(error)?.type;
  return typeof type === 'string' ? type : undefined;
}

function getStripeErrorParam(error: unknown): string | undefined {
  const param = asStripeLikeError(error)?.param;
  return typeof param === 'string' ? param : undefined;
}

function getStripeRequestId(error: unknown): string | undefined {
  const requestId = asStripeLikeError(error)?.requestId;
  return typeof requestId === 'string' ? requestId : undefined;
}

function isStripeError(error: unknown): boolean {
  return (
    getStripeErrorType(error) !== undefined ||
    getStripeErrorCode(error) !== undefined ||
    getStripeStatusCode(error) !== undefined
  );
}

/**
 * A Stripe `resource_missing` names the offending param, which tells us which
 * of our persisted ids went stale without parsing the human message.
 */
function classifyResourceMissing(
  error: unknown,
  stage: SubscriptionPreviewStage,
): SubscriptionPreviewFailureCode {
  if (stage === SubscriptionPreviewStage.PRICE) {
    return SubscriptionPreviewFailureCode.PRICE_NOT_FOUND;
  }
  const param = getStripeErrorParam(error) ?? '';
  if (param.includes('price')) {
    return SubscriptionPreviewFailureCode.PRICE_NOT_FOUND;
  }
  if (param.includes('customer')) {
    return SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING;
  }
  return SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING;
}

function classifyUpcomingInvoiceError(
  error: StripeUpcomingInvoiceError,
): SubscriptionPreviewFailureCode {
  switch (error.code) {
    case StripeUpcomingInvoiceErrorCode.CUSTOMER_MISMATCH:
      return SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISMATCH;
    case StripeUpcomingInvoiceErrorCode.SUBSCRIPTION_ITEM_MISSING:
      return SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_OUT_OF_SYNC;
    case StripeUpcomingInvoiceErrorCode.INVALID_PRICE_ID:
      return SubscriptionPreviewFailureCode.PRICE_NOT_FOUND;
    case StripeUpcomingInvoiceErrorCode.INVALID_QUANTITY:
      return SubscriptionPreviewFailureCode.PREVIEW_REJECTED;
  }
}

function classifyStripeApiError(
  error: unknown,
  stage: SubscriptionPreviewStage,
): SubscriptionPreviewFailureCode {
  const category = classifyStripeFailure(error);
  if (category === 'customer_missing') {
    return classifyResourceMissing(error, stage);
  }
  if (category === 'provider_unavailable') {
    return SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE;
  }
  if (category === 'configuration') {
    return SubscriptionPreviewFailureCode.BILLING_PROVIDER_REJECTED;
  }

  // Stripe wraps its own 5xx as a generic StripeAPIError; that is an outage
  // worth one bounded retry, unlike the same class on a 4xx.
  const statusCode = getStripeStatusCode(error);
  if (statusCode !== undefined && statusCode >= 500) {
    return SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE;
  }

  const type = getStripeErrorType(error);
  if (type !== undefined && NON_TRANSIENT_STRIPE_TYPES.has(type)) {
    return SubscriptionPreviewFailureCode.BILLING_PROVIDER_REJECTED;
  }
  // StripeInvalidRequestError / StripeCardError: Stripe understood the request
  // and refused to price it (currency mismatch, cancelled subscription, ...).
  return SubscriptionPreviewFailureCode.PREVIEW_REJECTED;
}

/**
 * Turn whatever escaped a preview step into one stable typed exception.
 * Already-classified failures pass through unchanged; other NestJS 4xx
 * exceptions are treated as rejected client state; everything else is an
 * unclassified fault.
 */
export function toSubscriptionPreviewException(
  error: unknown,
  stage?: SubscriptionPreviewStage,
): SubscriptionPreviewException {
  if (error instanceof SubscriptionPreviewException) {
    return error;
  }
  if (error instanceof StripeUpcomingInvoiceError) {
    return new SubscriptionPreviewException(
      classifyUpcomingInvoiceError(error),
      error,
    );
  }
  if (stage !== undefined && isStripeError(error)) {
    return new SubscriptionPreviewException(
      classifyStripeApiError(error, stage),
      error,
    );
  }
  if (
    error instanceof HttpException &&
    error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
  ) {
    return new SubscriptionPreviewException(
      SubscriptionPreviewFailureCode.PREVIEW_REJECTED,
      error,
    );
  }
  return new SubscriptionPreviewException(
    SubscriptionPreviewFailureCode.PREVIEW_FAILED,
    error,
  );
}

function categoryOf(
  exception: SubscriptionPreviewException,
): SubscriptionPreviewFailureCategory {
  const { cause } = exception;
  if (cause instanceof StripeUpcomingInvoiceError) {
    return 'local_state';
  }
  if (isStripeError(cause)) {
    return classifyStripeFailure(cause);
  }
  if (exception.code === SubscriptionPreviewFailureCode.PREVIEW_FAILED) {
    return 'unknown';
  }
  return 'local_state';
}

export function getSubscriptionPreviewFailureDiagnostics(
  exception: SubscriptionPreviewException,
  stage?: SubscriptionPreviewStage,
): SubscriptionPreviewFailureDiagnostics {
  const { cause } = exception;
  const stripeCode = getStripeErrorCode(cause);
  const stripeRequestId = getStripeRequestId(cause);
  const stripeStatusCode = getStripeStatusCode(cause);

  return {
    category: categoryOf(exception),
    code: exception.code,
    errorName: cause instanceof Error ? cause.name : exception.name,
    isRetryable: exception.isRetryable,
    ...(stage === undefined ? {} : { stage }),
    ...(stripeCode === undefined ? {} : { stripeCode }),
    ...(stripeRequestId === undefined ? {} : { stripeRequestId }),
    ...(stripeStatusCode === undefined ? {} : { stripeStatusCode }),
  };
}
