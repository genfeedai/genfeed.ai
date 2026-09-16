import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SubscriptionsController } from '@api/collections/subscriptions/controllers/subscriptions.controller';
import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { HttpExceptionFilter } from '@api/helpers/filters/http-exception/http-exception.filter';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionPreviewFailureCode } from '@genfeedai/contracts/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

type MockFn = ReturnType<typeof vi.fn>;

const ORGANIZATION_ID = 'org_1';

describe('POST /subscriptions/current/preview HTTP composition', () => {
  let app: INestApplication;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const configService = { get: () => 'production' };
  let previewSubscriptionChange: MockFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    previewSubscriptionChange = vi.fn();
    const module = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: { previewSubscriptionChange },
        },
        { provide: CreditsUtilsService, useValue: {} },
        { provide: OrganizationsService, useValue: {} },
        { provide: SubscriptionCreditGrantService, useValue: {} },
        { provide: LoggerService, useValue: logger },
        { provide: ConfigService, useValue: configService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, {
        context: { organizationId: ORGANIZATION_ID },
        user: {
          id: 'user_1',
          organizationId: ORGANIZATION_ID,
          userId: 'user_1',
        },
      });
      next();
    });
    // Same global filter as main.ts: the method-level preview filter must win.
    app.useGlobalFilters(
      new HttpExceptionFilter(
        logger as unknown as LoggerService,
        configService as unknown as ConfigService,
      ),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the preview envelope on success', async () => {
    previewSubscriptionChange.mockResolvedValue({ newPriceId: 'price_new' });

    // Nest's POST default; the route has never declared an explicit code.
    const response = await request(app.getHttpServer())
      .post('/subscriptions/current/preview')
      .send({ price: 'price_new' })
      .expect(201);

    expect(previewSubscriptionChange).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'price_new',
    );
    expect(response.body).toEqual({
      data: { newPriceId: 'price_new' },
      message: 'Preview generated successfully',
      success: true,
    });
  });

  it('renders a retryable provider outage as 503 with the code, retry meta and Retry-After', async () => {
    previewSubscriptionChange.mockRejectedValue(
      new SubscriptionPreviewException(
        SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
        Object.assign(new Error('ECONNRESET provider-secret-token'), {
          type: 'StripeConnectionError',
        }),
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/subscriptions/current/preview')
      .send({ price: 'price_new' })
      .expect(503);

    expect(response.headers['retry-after']).toBe('5');
    expect(response.body).toEqual({
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
    expect(response.text).not.toContain('provider-secret-token');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('renders a missing subscription as a typed 404 instead of a generic 500', async () => {
    previewSubscriptionChange.mockRejectedValue(
      new SubscriptionPreviewException(
        SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING,
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/subscriptions/current/preview')
      .send({ price: 'price_new' })
      .expect(404);

    expect(response.headers['retry-after']).toBeUndefined();
    expect(response.body.errors[0]).toMatchObject({
      code: 'subscription_missing',
      meta: { isRetryable: false, maxRetries: 0, retryAfterSeconds: null },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('turns an unknown failure into a typed preview_failed 500 that is reported once without the raw message', async () => {
    previewSubscriptionChange.mockRejectedValue(
      new Error('boom provider-secret-token'),
    );

    const response = await request(app.getHttpServer())
      .post('/subscriptions/current/preview')
      .send({ price: 'price_new' })
      .expect(500);

    expect(response.body.errors[0]).toMatchObject({
      code: 'preview_failed',
      detail: 'Failed to generate preview',
      meta: { isRetryable: false, maxRetries: 0, retryAfterSeconds: null },
    });
    expect(response.text).not.toContain('provider-secret-token');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(SubscriptionPreviewException),
      { extra: expect.objectContaining({ code: 'preview_failed' }) },
    );
  });
});
