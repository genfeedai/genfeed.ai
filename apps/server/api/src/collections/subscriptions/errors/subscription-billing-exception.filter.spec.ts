import { SubscriptionBillingExceptionFilter } from '@api/collections/subscriptions/errors/subscription-billing-exception.filter';
import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import { toSubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview-failure.util';
import { SubscriptionPreviewFailureCode } from '@genfeedai/contracts/interfaces/billing';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ArgumentsHost } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captured: [] as Array<{ exception: unknown; hint: unknown }>,
}));
vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: (exception: unknown, hint: unknown) => {
    sentry.captured.push({ exception, hint });
    return 'event-id';
  },
}));

interface WrittenResponse {
  body?: unknown;
  headers: Record<string, string>;
  status?: number;
}

describe('SubscriptionBillingExceptionFilter', () => {
  let logs: Array<{ context: unknown; level: string; message: string }>;
  let written: WrittenResponse;
  let host: ArgumentsHost;
  let sentryEnvironment: string;

  function buildFilter(): SubscriptionBillingExceptionFilter {
    return new SubscriptionBillingExceptionFilter(
      {
        error: (message: string, _error: unknown, context: unknown) => {
          logs.push({ context, level: 'error', message });
        },
        warn: (message: string, context: unknown) => {
          logs.push({ context, level: 'warn', message });
        },
      } as unknown as LoggerService,
      {
        get: (key: string) =>
          key === 'SENTRY_ENVIRONMENT' ? sentryEnvironment : undefined,
      } as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    sentry.captured.length = 0;
    sentryEnvironment = 'production';
    logs = [];
    written = { headers: {} };
    const response = {
      json: (body: unknown) => {
        written.body = body;
        return response;
      },
      setHeader: (name: string, value: string) => {
        written.headers[name] = value;
      },
      status: (status: number) => {
        written.status = status;
        return response;
      },
    };
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

    expect(written).toEqual({
      body: {
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
      },
      headers: { 'Retry-After': '5' },
      status: 503,
    });
    expect(logs).toEqual([
      {
        context: expect.objectContaining({
          code: 'billing_provider_unavailable',
          isRetryable: true,
        }),
        level: 'warn',
        message: 'Subscription preview failed',
      },
    ]);
    expect(sentry.captured).toEqual([]);
  });

  it('renders expected client state as its 4xx without paging error tracking', () => {
    buildFilter().catch(
      new SubscriptionPreviewException(
        SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING,
      ),
      host,
    );

    expect(written).toEqual({
      body: {
        errors: [
          expect.objectContaining({
            code: 'subscription_missing',
            meta: {
              isRetryable: false,
              maxRetries: 0,
              retryAfterSeconds: null,
            },
            status: '404',
          }),
        ],
      },
      headers: {},
      status: 404,
    });
    expect(logs.map(({ level }) => level)).toEqual(['warn']);
    expect(sentry.captured).toEqual([]);
  });

  it('reports an unclassified fault to error tracking with safe diagnostics only', () => {
    const cause = Object.assign(new Error('token provider-secret-token'), {
      raw: { headers: { authorization: 'Bearer provider-secret-token' } },
    });
    const exception = toSubscriptionPreviewException(cause);

    buildFilter().catch(exception, host);

    expect(written.status).toBe(500);
    expect(sentry.captured).toEqual([
      {
        exception,
        hint: {
          extra: expect.objectContaining({
            category: 'unknown',
            code: 'preview_failed',
            errorName: 'Error',
          }),
        },
      },
    ]);
    expect(logs.map(({ level }) => level)).toEqual(['error']);
    expect(JSON.stringify(logs)).not.toContain('provider-secret-token');
    expect(JSON.stringify(written.body)).not.toContain('provider-secret-token');
  });

  it('keeps faults out of error tracking in the development environment', () => {
    sentryEnvironment = 'development';

    buildFilter().catch(
      toSubscriptionPreviewException(new Error('local boom')),
      host,
    );

    expect(sentry.captured).toEqual([]);
    expect(logs).toEqual([
      {
        context: expect.objectContaining({ code: 'preview_failed' }),
        level: 'error',
        message: expect.any(String),
      },
    ]);
  });
});
