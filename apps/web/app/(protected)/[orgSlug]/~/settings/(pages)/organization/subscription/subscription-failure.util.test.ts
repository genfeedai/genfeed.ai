import {
  SubscriptionChangeFailureCode,
  SubscriptionPreviewFailureCode,
} from '@genfeedai/contracts/interfaces/billing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSubscriptionFailureView,
  SUBSCRIPTION_FAILURE_FALLBACK_KEY,
} from './subscription-failure.util';

const NOW = new Date('2026-09-16T12:00:00.000Z').getTime();

/** An axios-shaped rejection carrying a JSON:API error document. */
function apiError(member: Record<string, unknown>) {
  return { response: { data: { errors: [member] } } };
}

describe('getSubscriptionFailureView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [SubscriptionPreviewFailureCode.PRICE_NOT_FOUND, 'priceNotFound'],
    [
      SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING,
      'billingCustomerMissing',
    ],
    [
      SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_OUT_OF_SYNC,
      'stripeSubscriptionOutOfSync',
    ],
    [
      SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING,
      'subscriptionMissing',
    ],
    [
      SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED,
      'planChangeNotRecorded',
    ],
    [
      SubscriptionChangeFailureCode.PLAN_INTERVAL_UNSUPPORTED,
      'planIntervalUnsupported',
    ],
  ])('maps %s to its own message', (code, suffix) => {
    const view = getSubscriptionFailureView(apiError({ code }));

    expect(view.code).toBe(code);
    expect(view.messageKey).toBe(`subscription.plans.failures.${suffix}`);
    expect(view.retry).toBeUndefined();
  });

  it.each([
    ['an unknown code', apiError({ code: 'something_new' })],
    ['no code at all', apiError({ detail: 'boom' })],
    ['a non-JSON:API error', new Error('network down')],
    ['a null rejection', null],
    // The server names the code, and an `in` check would answer for inherited
    // members, handing the catalog lookup a prototype member.
    ['a prototype member name', apiError({ code: 'constructor' })],
    ['another prototype member name', apiError({ code: 'toString' })],
  ])('falls back to the generic message for %s', (_label, error) => {
    const view = getSubscriptionFailureView(error);

    expect(view.messageKey).toBe(SUBSCRIPTION_FAILURE_FALLBACK_KEY);
    expect(view.code).toBeUndefined();
    expect(view.retry).toBeUndefined();
  });

  describe('retry allowance', () => {
    it('reads the bound the API granted', () => {
      const view = getSubscriptionFailureView(
        apiError({
          code: SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
          meta: { isRetryable: true, maxRetries: 2, retryAfterSeconds: 5 },
        }),
      );

      expect(view.retry).toEqual({
        maxAttempts: 2,
        notBeforeMs: NOW + 5_000,
      });
    });

    it('allows an immediate retry when no wait was given', () => {
      const view = getSubscriptionFailureView(
        apiError({
          code: SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
          meta: { isRetryable: true, maxRetries: 1, retryAfterSeconds: 0 },
        }),
      );

      expect(view.retry).toEqual({ maxAttempts: 1, notBeforeMs: NOW });
    });

    it.each([
      [
        'the failure is not flagged retryable',
        { isRetryable: false, maxRetries: 3 },
      ],
      ['no attempts are granted', { isRetryable: true, maxRetries: 0 }],
      [
        'the budget is not a whole number',
        { isRetryable: true, maxRetries: 1.5 },
      ],
      ['the budget is negative', { isRetryable: true, maxRetries: -1 }],
      [
        'the flag is a lookalike string',
        { isRetryable: 'true', maxRetries: 1 },
      ],
      ['meta is absent', undefined],
    ])('offers no retry when %s', (_label, meta) => {
      const view = getSubscriptionFailureView(
        apiError({
          code: SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
          ...(meta === undefined ? {} : { meta }),
        }),
      );

      expect(view.retry).toBeUndefined();
    });
  });
});
