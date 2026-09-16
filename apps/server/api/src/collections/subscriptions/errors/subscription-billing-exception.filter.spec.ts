import { SubscriptionBillingExceptionFilter } from '@api/collections/subscriptions/errors/subscription-billing-exception.filter';
import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import { toSubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview-failure.util';
import { SubscriptionPreviewFailureCode } from '@genfeedai/contracts/interfaces/billing';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

type MockFn = ReturnType<typeof vi.fn>;

describe('SubscriptionBillingExceptionFilter', () => {
  let logger: { error: MockFn; log: MockFn; warn: MockFn };
  let response: { json: MockFn; setHeader: MockFn; status: MockFn };
  let host: ArgumentsHost;
  let sentryEnvironment: string;

  function buildFilter(): SubscriptionBillingExceptionFilter {
    return new SubscriptionBillingExceptionFilter(
      logger as unknown as LoggerService,
      {
        get: (key: string) =>
          key === 'SENTRY_ENVIRONMENT' ? sentryEnvironment : undefined,
      } as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sentryEnvironment = 'production';
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    response = { json: vi.fn(), setHeader: vi.fn(), status: vi.fn() };
    response.status.mockReturnValue(response);
    host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
  });

  it('writes the code and retry contract as one JSON:API error and advertises Retry-After', () => {
    buildFilter().catch(
      new SubscriptionPreviewException(
        SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
      ),
      host,
    );

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      errors: [
        {
          code: 'billing_provider_unavailable',
          detail:
            'The billing provider is temporarily unavailable; retry shortly',
          meta: { isRetryable: true, maxRetries: 1, retryAfterSeconds: 5 },
          status: '503',
          title: 'Subscription preview failed',
        },
      ],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Subscription preview failed',
      expect.objectContaining({
        code: 'billing_provider_unavailable',
        isRetryable: true,
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('renders expected client state as its 4xx without paging error tracking', () => {
    buildFilter().catch(
      new SubscriptionPreviewException(
        SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING,
      ),
      host,
    );

    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      errors: [
        expect.objectContaining({
          code: 'subscription_missing',
          meta: { isRetryable: false, maxRetries: 0, retryAfterSeconds: null },
          status: '404',
        }),
      ],
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports an unclassified fault to error tracking with safe diagnostics only', () => {
    const cause = Object.assign(new Error('token provider-secret-token'), {
      raw: { headers: { authorization: 'Bearer provider-secret-token' } },
    });
    const exception = toSubscriptionPreviewException(cause);

    buildFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(exception, {
      extra: expect.objectContaining({
        category: 'unknown',
        code: 'preview_failed',
        errorName: 'Error',
      }),
    });
    const [, , loggedContext] = logger.error.mock.calls[0];
    expect(JSON.stringify(loggedContext)).not.toContain(
      'provider-secret-token',
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'provider-secret-token',
    );
  });

  it('keeps faults out of error tracking in the development environment', () => {
    sentryEnvironment = 'development';

    buildFilter().catch(
      toSubscriptionPreviewException(new Error('local boom')),
      host,
    );

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ code: 'preview_failed' }),
    );
  });
});
