import {
  classifyStripeFailure,
  getStripeErrorParam,
  isNonTransientStripeErrorType,
  isStripeError,
  isStripeServerFault,
} from '@api/collections/subscriptions/errors/stripe-failure-reader.util';
import {
  buildSubscriptionFailureDiagnostics,
  type SubscriptionFailureDiagnostics,
} from '@api/collections/subscriptions/errors/subscription-failure-diagnostics.util';
import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
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

export type SubscriptionPreviewFailureDiagnostics =
  SubscriptionFailureDiagnostics<SubscriptionPreviewStage>;

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
  if (isStripeServerFault(error)) {
    return SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE;
  }
  if (isNonTransientStripeErrorType(error)) {
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

export function getSubscriptionPreviewFailureDiagnostics(
  exception: SubscriptionPreviewException,
  stage?: SubscriptionPreviewStage,
): SubscriptionPreviewFailureDiagnostics {
  return buildSubscriptionFailureDiagnostics({
    exception,
    isUnclassified:
      exception.code === SubscriptionPreviewFailureCode.PREVIEW_FAILED,
    stage,
  });
}
