import { SubscriptionChangeException } from '@api/collections/subscriptions/errors/subscription-change.exception';
import {
  getSubscriptionChangeFailureDiagnostics,
  SubscriptionChangeStage,
  toSubscriptionChangeException,
} from '@api/collections/subscriptions/errors/subscription-change-failure.util';
import { SubscriptionChangeFailureCode } from '@genfeedai/contracts/interfaces/billing';
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
  return Object.assign(new Error('provider-secret-token must not be echoed'), {
    raw: { headers: { authorization: 'Bearer provider-secret-token' } },
    ...overrides,
  });
}

describe('toSubscriptionChangeException', () => {
  it('passes an already classified failure through untouched', () => {
    const typed = new SubscriptionChangeException(
      SubscriptionChangeFailureCode.SUBSCRIPTION_MISSING,
    );

    expect(toSubscriptionChangeException(typed)).toBe(typed);
  });

  describe('after Stripe has applied the change', () => {
    it.each([
      ['a database error', new Error('connection terminated')],
      ['an unmappable provider status', new TypeError('bad status')],
      ['a Stripe-shaped error', stripeError({ type: 'StripeConnectionError' })],
    ])(
      'reports %s during the record stage as a billing divergence, not a retry',
      (_label, cause) => {
        const exception = toSubscriptionChangeException(
          cause,
          SubscriptionChangeStage.RECORD,
        );

        expect(exception.code).toBe(
          SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED,
        );
        expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(exception.isRetryable).toBe(false);
      },
    );

    it('reports a credit-stage failure as plan_credits_not_reset', () => {
      const exception = toSubscriptionChangeException(
        new Error('credit ledger unavailable'),
        SubscriptionChangeStage.CREDITS,
      );

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.PLAN_CREDITS_NOT_RESET,
      );
      expect(exception.isRetryable).toBe(false);
    });
  });

  describe('Stripe resource_missing', () => {
    it('is a missing price when the price stage fails', () => {
      const exception = toSubscriptionChangeException(
        stripeError({
          code: 'resource_missing',
          param: 'id',
          statusCode: 404,
          type: 'StripeInvalidRequestError',
        }),
        SubscriptionChangeStage.PRICE,
      );

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.PRICE_NOT_FOUND,
      );
    });

    it.each([
      ['items[0][price]', SubscriptionChangeFailureCode.PRICE_NOT_FOUND],
      [
        'subscription',
        SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING,
      ],
      [undefined, SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING],
    ])(
      'uses the offending param (%s) during the plan-change stage',
      (param, expectedCode) => {
        const exception = toSubscriptionChangeException(
          stripeError({
            code: 'resource_missing',
            param,
            statusCode: 404,
            type: 'StripeInvalidRequestError',
          }),
          SubscriptionChangeStage.PLAN_CHANGE,
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
      const exception = toSubscriptionChangeException(
        stripeError({ code, statusCode, type }),
        SubscriptionChangeStage.PLAN_CHANGE,
      );

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.BILLING_PROVIDER_UNAVAILABLE,
      );
      expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
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
  ])(
    'classifies %s as a non-retryable provider rejection',
    (type, statusCode) => {
      const exception = toSubscriptionChangeException(
        stripeError({ statusCode, type }),
        SubscriptionChangeStage.PLAN_CHANGE,
      );

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.BILLING_PROVIDER_REJECTED,
      );
      expect(exception.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    },
  );

  it('treats a change Stripe understood and refused as plan_change_rejected', () => {
    const exception = toSubscriptionChangeException(
      stripeError({
        code: 'parameter_invalid',
        statusCode: 400,
        type: 'StripeInvalidRequestError',
      }),
      SubscriptionChangeStage.PLAN_CHANGE,
    );

    expect(exception.code).toBe(
      SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED,
    );
    expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('treats any other NestJS 4xx as rejected client state', () => {
    const exception = toSubscriptionChangeException(
      new BadRequestException('No active Stripe subscription found'),
    );

    expect(exception.code).toBe(
      SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED,
    );
  });

  it('falls back to an unclassified fault for anything else', () => {
    const cause = new TypeError('recurring is undefined');
    const exception = toSubscriptionChangeException(cause);

    expect(exception.code).toBe(
      SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED,
    );
    expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(exception.cause).toBe(cause);
  });

  it('keeps a Stripe-shaped error outside a Stripe stage from masquerading as a provider fault', () => {
    const exception = toSubscriptionChangeException(
      stripeError({ type: 'StripeConnectionError' }),
    );

    expect(exception.code).toBe(
      SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED,
    );
  });
});

describe('SubscriptionChangeException', () => {
  it('serializes only the public code, detail, title, status and retry meta', () => {
    const exception = new SubscriptionChangeException(
      SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED,
      stripeError({ type: 'StripeConnectionError' }),
    );

    expect(exception.getResponse()).toEqual({
      code: 'plan_change_not_recorded',
      detail:
        'The plan change reached the billing provider but could not be recorded; support has been notified',
      meta: { isRetryable: false, maxRetries: 0, retryAfterSeconds: null },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Subscription plan change failed',
    });
    expect(JSON.stringify(exception.getResponse())).not.toContain(
      'provider-secret-token',
    );
  });
});

describe('getSubscriptionChangeFailureDiagnostics', () => {
  it('reports Stripe code, status and request id but never the message or raw payload', () => {
    const exception = toSubscriptionChangeException(
      stripeError({
        code: 'rate_limit',
        requestId: 'req_77',
        statusCode: 429,
        type: 'StripeRateLimitError',
      }),
      SubscriptionChangeStage.PLAN_CHANGE,
    );

    const diagnostics = getSubscriptionChangeFailureDiagnostics(
      exception,
      SubscriptionChangeStage.PLAN_CHANGE,
    );

    expect(diagnostics).toEqual({
      category: 'provider_unavailable',
      code: 'billing_provider_unavailable',
      errorName: 'Error',
      isRetryable: true,
      stage: 'plan_change',
      stripeCode: 'rate_limit',
      stripeRequestId: 'req_77',
      stripeStatusCode: 429,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('provider-secret-token');
  });

  it('labels a local precondition failure as local state', () => {
    const diagnostics = getSubscriptionChangeFailureDiagnostics(
      new SubscriptionChangeException(
        SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING,
      ),
    );

    expect(diagnostics).toEqual({
      category: 'local_state',
      code: 'stripe_subscription_missing',
      errorName: 'SubscriptionChangeException',
      isRetryable: false,
    });
  });

  it('labels an unclassified fault as unknown', () => {
    const diagnostics = getSubscriptionChangeFailureDiagnostics(
      toSubscriptionChangeException(new RangeError('boom')),
    );

    expect(diagnostics.category).toBe('unknown');
    expect(diagnostics.errorName).toBe('RangeError');
  });
});
