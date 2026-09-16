import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import {
  getSubscriptionPreviewFailureDiagnostics,
  SubscriptionPreviewStage,
  toSubscriptionPreviewException,
} from '@api/collections/subscriptions/errors/subscription-preview-failure.util';
import {
  StripeUpcomingInvoiceError,
  StripeUpcomingInvoiceErrorCode,
} from '@api/services/integrations/stripe/services/stripe-upcoming-invoice.error';
import { SubscriptionPreviewFailureCode } from '@genfeedai/contracts/interfaces/billing';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

/** Shape of the Stripe SDK's `StripeError` as the classifier reads it. */
function stripeError(overrides: {
  code?: string;
  param?: string;
  requestId?: string;
  statusCode?: number;
  type: string;
}): Error & typeof overrides & { raw: { headers: Record<string, string> } } {
  return Object.assign(
    new Error('provider-secret-token must never be echoed'),
    {
      raw: { headers: { authorization: 'Bearer provider-secret-token' } },
      ...overrides,
    },
  );
}

describe('toSubscriptionPreviewException', () => {
  it('passes an already classified failure through untouched', () => {
    const typed = new SubscriptionPreviewException(
      SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING,
    );

    expect(toSubscriptionPreviewException(typed)).toBe(typed);
  });

  it.each([
    [
      StripeUpcomingInvoiceErrorCode.CUSTOMER_MISMATCH,
      SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISMATCH,
      HttpStatus.CONFLICT,
    ],
    [
      StripeUpcomingInvoiceErrorCode.SUBSCRIPTION_ITEM_MISSING,
      SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_OUT_OF_SYNC,
      HttpStatus.CONFLICT,
    ],
    [
      StripeUpcomingInvoiceErrorCode.INVALID_PRICE_ID,
      SubscriptionPreviewFailureCode.PRICE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
    ],
    [
      StripeUpcomingInvoiceErrorCode.INVALID_QUANTITY,
      SubscriptionPreviewFailureCode.PREVIEW_REJECTED,
      HttpStatus.UNPROCESSABLE_ENTITY,
    ],
  ])(
    'maps the StripeService consistency check %s to %s',
    (stripeCode, expectedCode, expectedStatus) => {
      const exception = toSubscriptionPreviewException(
        new StripeUpcomingInvoiceError(stripeCode, 'local check failed'),
        SubscriptionPreviewStage.UPCOMING_INVOICE,
      );

      expect(exception.code).toBe(expectedCode);
      expect(exception.getStatus()).toBe(expectedStatus);
      expect(exception.isRetryable).toBe(false);
    },
  );

  describe('Stripe resource_missing', () => {
    it('is a missing price when the price stage fails', () => {
      const exception = toSubscriptionPreviewException(
        stripeError({
          code: 'resource_missing',
          param: 'id',
          statusCode: 404,
          type: 'StripeInvalidRequestError',
        }),
        SubscriptionPreviewStage.PRICE,
      );

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.PRICE_NOT_FOUND,
      );
    });

    it.each([
      [
        'subscription',
        SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING,
      ],
      [
        'subscription_details[items][0][price]',
        SubscriptionPreviewFailureCode.PRICE_NOT_FOUND,
      ],
      ['customer', SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING],
      [undefined, SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING],
    ])(
      'uses the offending param (%s) during the invoice preview stage',
      (param, expectedCode) => {
        const exception = toSubscriptionPreviewException(
          stripeError({
            code: 'resource_missing',
            param,
            statusCode: 404,
            type: 'StripeInvalidRequestError',
          }),
          SubscriptionPreviewStage.UPCOMING_INVOICE,
        );

        expect(exception.code).toBe(expectedCode);
      },
    );
  });

  it.each([
    ['StripeConnectionError', undefined, undefined],
    ['StripeRateLimitError', 'rate_limit', 429],
    ['StripeAPIError', undefined, 503],
  ])(
    'classifies %s as a retryable provider outage with a bounded retry contract',
    (type, code, statusCode) => {
      const exception = toSubscriptionPreviewException(
        stripeError({ code, statusCode, type }),
        SubscriptionPreviewStage.UPCOMING_INVOICE,
      );

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
      );
      expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(exception.isRetryable).toBe(true);
      expect(exception.meta).toEqual({
        isRetryable: true,
        maxRetries: 1,
        retryAfterSeconds: 5,
      });
    },
  );

  it.each([
    ['StripeAuthenticationError', 401],
    ['StripePermissionError', 403],
    ['StripeAPIError', 400],
    ['StripeIdempotencyError', 400],
  ])(
    'classifies %s as a non-retryable provider rejection',
    (type, statusCode) => {
      const exception = toSubscriptionPreviewException(
        stripeError({ statusCode, type }),
        SubscriptionPreviewStage.PRICE,
      );

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.BILLING_PROVIDER_REJECTED,
      );
      expect(exception.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(exception.isRetryable).toBe(false);
    },
  );

  it.each([
    ['StripeInvalidRequestError', 'invoice_upcoming_none', 400],
    ['StripeInvalidRequestError', 'parameter_invalid_empty', 400],
    ['StripeCardError', 'card_declined', 402],
  ])(
    'treats a proration the provider refused to price (%s / %s) as rejected',
    (type, code, statusCode) => {
      const exception = toSubscriptionPreviewException(
        stripeError({ code, statusCode, type }),
        SubscriptionPreviewStage.UPCOMING_INVOICE,
      );

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.PREVIEW_REJECTED,
      );
      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    },
  );

  it('treats any other NestJS 4xx as rejected client state', () => {
    const exception = toSubscriptionPreviewException(
      new BadRequestException('Subscription stripePriceId is required'),
    );

    expect(exception.code).toBe(
      SubscriptionPreviewFailureCode.PREVIEW_REJECTED,
    );
  });

  it('falls back to an unclassified fault for anything else', () => {
    const cause = new TypeError('Cannot read properties of undefined');
    const exception = toSubscriptionPreviewException(cause);

    expect(exception.code).toBe(SubscriptionPreviewFailureCode.PREVIEW_FAILED);
    expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(exception.cause).toBe(cause);
  });

  it('keeps a Stripe-shaped error outside a Stripe stage from masquerading as a provider fault', () => {
    const exception = toSubscriptionPreviewException(
      stripeError({ type: 'StripeConnectionError' }),
    );

    expect(exception.code).toBe(SubscriptionPreviewFailureCode.PREVIEW_FAILED);
  });
});

describe('SubscriptionPreviewException', () => {
  it('serializes only the public code, detail, title, status and retry meta', () => {
    const cause = stripeError({
      code: 'rate_limit',
      type: 'StripeRateLimitError',
    });
    const exception = new SubscriptionPreviewException(
      SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
      cause,
    );

    const body = JSON.stringify(exception.getResponse());

    expect(exception.getResponse()).toEqual({
      code: 'billing_provider_unavailable',
      detail: 'The billing provider is temporarily unavailable; retry shortly',
      meta: { isRetryable: true, maxRetries: 1, retryAfterSeconds: 5 },
      status: HttpStatus.SERVICE_UNAVAILABLE,
      title: 'Subscription preview failed',
    });
    expect(body).not.toContain('provider-secret-token');
    expect(body).not.toContain('authorization');
    expect(exception.message).toBe(
      'The billing provider is temporarily unavailable; retry shortly',
    );
  });
});

describe('getSubscriptionPreviewFailureDiagnostics', () => {
  it('reports Stripe code, status and request id but never the message or raw payload', () => {
    const exception = toSubscriptionPreviewException(
      stripeError({
        code: 'rate_limit',
        requestId: 'req_123',
        statusCode: 429,
        type: 'StripeRateLimitError',
      }),
      SubscriptionPreviewStage.PRICE,
    );

    const diagnostics = getSubscriptionPreviewFailureDiagnostics(
      exception,
      SubscriptionPreviewStage.PRICE,
    );

    expect(diagnostics).toEqual({
      category: 'provider_unavailable',
      code: 'billing_provider_unavailable',
      errorName: 'Error',
      isRetryable: true,
      stage: 'price',
      stripeCode: 'rate_limit',
      stripeRequestId: 'req_123',
      stripeStatusCode: 429,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('provider-secret-token');
  });

  it('labels local prerequisite failures as local state', () => {
    const diagnostics = getSubscriptionPreviewFailureDiagnostics(
      new SubscriptionPreviewException(
        SubscriptionPreviewFailureCode.CURRENT_PRICE_MISSING,
      ),
    );

    expect(diagnostics).toEqual({
      category: 'local_state',
      code: 'current_price_missing',
      errorName: 'SubscriptionPreviewException',
      isRetryable: false,
    });
  });

  it('labels an unclassified fault as unknown', () => {
    const diagnostics = getSubscriptionPreviewFailureDiagnostics(
      toSubscriptionPreviewException(new RangeError('boom')),
    );

    expect(diagnostics.category).toBe('unknown');
    expect(diagnostics.errorName).toBe('RangeError');
  });
});
