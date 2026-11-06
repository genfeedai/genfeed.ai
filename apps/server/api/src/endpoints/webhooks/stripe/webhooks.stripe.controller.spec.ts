vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: () => false,
}));

import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { StripeWebhookErrorKind } from '@api/endpoints/webhooks/stripe/stripe-webhook-error.util';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import type { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { SystemEventsService } from '@api/services/system-events/system-events.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import {
  BadRequestException,
  type HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type LogEntry = unknown[];

const SIGNATURE = 'valid-signature';

describe('StripeWebhookController', () => {
  // The event Stripe signed, and everything a delivery leaves behind:
  // the durable event log, handled events, claimed and released keys, and logs.
  let event: Row;
  let timeline: string[];
  let recorded: Row[];
  let handled: [Row, string][];
  let claims: unknown[][];
  let claimedKeys: Set<string>;
  let releasedKeys: string[];
  let logs: LogEntry[];
  let warnings: LogEntry[];
  let errors: LogEntry[];
  let handlerFailure: unknown;
  let isEventStoreDown: boolean;
  let controller: StripeWebhookController;

  const deliver = (headers: Row = { 'stripe-signature': SIGNATURE }) =>
    controller.handleStripe({
      body: Buffer.from('{}'),
      headers,
    } as unknown as Request);
  const failWith = (error: unknown) => {
    handlerFailure = error;
  };

  beforeEach(() => {
    event = {
      data: { object: { id: 'in_1' } },
      id: 'evt_1',
      type: 'invoice.paid',
    };
    timeline = [];
    recorded = [];
    handled = [];
    claims = [];
    claimedKeys = new Set();
    releasedKeys = [];
    logs = [];
    warnings = [];
    errors = [];
    handlerFailure = undefined;
    isEventStoreDown = false;

    const publisher = {
      del: async (key: string) => {
        releasedKeys.push(key);
        return Number(claimedKeys.delete(key));
      },
      // Redis SET NX: only the first delivery of an event id claims it.
      set: async (key: string, ...options: unknown[]) => {
        claims.push([key, ...options]);
        if (claimedKeys.has(key)) return null;
        claimedKeys.add(key);
        return 'OK';
      },
    };
    controller = new StripeWebhookController(
      {
        error: (...entry: unknown[]) => {
          errors.push(entry);
        },
        log: (...entry: unknown[]) => {
          logs.push(entry);
        },
        warn: (...entry: unknown[]) => {
          warnings.push(entry);
        },
      } as unknown as LoggerService,
      { getPublisher: () => publisher } as unknown as RedisService,
      {
        constructWebhookEvent: async (_body: Buffer, signature?: string) => {
          if (signature !== SIGNATURE) {
            throw new BadRequestException('Invalid Stripe signature');
          }
          return event;
        },
      } as unknown as StripeService,
      {
        handleWebhookEvent: async (delivered: Row, url: string) => {
          timeline.push('handled');
          if (handlerFailure) throw handlerFailure;
          handled.push([delivered, url]);
        },
      } as unknown as StripeWebhookService,
      {
        recordStripeEvent: async (delivered: Row) => {
          if (isEventStoreDown) throw new Error('Database unavailable');
          timeline.push('recorded');
          recorded.push(delivered);
        },
      } as unknown as SystemEventsService,
    );
  });

  it('records, claims and handles a verified event once', async () => {
    await expect(deliver()).resolves.toEqual({ success: true });

    expect(recorded).toEqual([event]);
    expect(handled).toEqual([
      [event, expect.stringContaining('StripeWebhookController')],
    ]);
    expect(claims).toEqual([
      ['stripe:webhook:evt_1', expect.any(String), 'EX', 86_400, 'NX'],
    ]);
    expect(logs).toEqual([
      [
        expect.stringContaining('webhook validated'),
        { id: 'evt_1', type: 'invoice.paid' },
      ],
    ]);
  });

  it('skips a duplicate delivery of an event another delivery already claimed', async () => {
    await deliver();

    await expect(deliver()).resolves.toEqual({ success: true });

    expect(handled).toHaveLength(1);
    expect(recorded).toHaveLength(2);
    expect(logs).toContainEqual([
      expect.stringContaining('duplicate event skipped'),
      {
        id: 'evt_1',
        kind: StripeWebhookErrorKind.IDEMPOTENT,
        type: 'invoice.paid',
      },
    ]);
  });

  it('fails before any billing effect or key claim when the event log is down', async () => {
    isEventStoreDown = true;

    await expect(deliver()).rejects.toThrow('Database unavailable');
    expect(handled).toEqual([]);
    expect(claims).toEqual([]);
  });

  it('persists provider activity before billing rejects it as non-retryable', async () => {
    failWith(new BadRequestException('Invalid billing metadata'));

    await deliver().catch(() => undefined);

    expect(recorded).toEqual([event]);
    expect(timeline).toEqual(['recorded', 'handled']);
  });

  it.each([
    ['an invalid', { 'stripe-signature': 'invalid-signature' }],
    ['a missing', {}],
  ])(
    'rejects %s signature as 400 without recording or claiming',
    async (_case, headers) => {
      const thrown = await deliver(headers).catch(
        (error: HttpException) => error,
      );

      expect((thrown as HttpException).getStatus()).toBe(
        HttpStatus.BAD_REQUEST,
      );
      expect(warnings).toEqual([
        [
          expect.stringContaining('webhook signature rejected'),
          {
            errorName: 'BadRequestException',
            kind: StripeWebhookErrorKind.SIGNATURE,
          },
        ],
      ]);
      expect(errors).toEqual([]);
      expect(recorded).toEqual([]);
      expect(releasedKeys).toEqual([]);
    },
  );

  it('reports a real handler fault and releases the key for redelivery', async () => {
    const fault = new Error('Processing failed');
    failWith(fault);
    event = { ...event, id: 'evt_456', type: 'customer.created' };

    await expect(deliver()).rejects.toBe(fault);

    expect(errors).toEqual([
      [
        expect.stringContaining('processing failed'),
        fault,
        {
          errorName: 'Error',
          eventId: 'evt_456',
          eventType: 'customer.created',
          kind: StripeWebhookErrorKind.FAULT,
        },
      ],
    ]);
    expect(releasedKeys).toEqual(['stripe:webhook:evt_456']);
    expect(claimedKeys.has('stripe:webhook:evt_456')).toBe(false);
  });

  it('passes an expected handler 4xx through and keeps the key', async () => {
    const expected = new BadRequestException(
      'Managed checkout is not configured',
    );
    failWith(expected);

    await expect(deliver()).rejects.toBe(expected);

    expect(warnings).toEqual([
      [
        expect.stringContaining('webhook expected rejected'),
        expect.objectContaining({
          eventId: 'evt_1',
          kind: StripeWebhookErrorKind.EXPECTED,
        }),
      ],
    ]);
    expect(releasedKeys).toEqual([]);
  });

  it('acknowledges a Prisma unique-constraint replay instead of a 500', async () => {
    failWith({ code: 'P2002' });

    await expect(deliver()).resolves.toEqual({ success: true });

    expect(warnings).toEqual([
      [
        expect.stringContaining('webhook replay acknowledged'),
        expect.objectContaining({
          eventId: 'evt_1',
          kind: StripeWebhookErrorKind.REPLAY,
        }),
      ],
    ]);
    expect(releasedKeys).toEqual([]);
  });

  it('rejects a retryable identity_missing billing error as 503 and releases the key', async () => {
    const missing = new StripeWebhookBillingError('identity_missing');
    failWith(missing);
    event = {
      ...event,
      id: 'evt_missing',
      type: 'customer.subscription.created',
    };

    await expect(deliver()).rejects.toBe(missing);

    expect(missing.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(warnings).toEqual([
      [
        expect.stringContaining('webhook billing rejected'),
        {
          code: 'identity_missing',
          errorName: 'StripeWebhookBillingError',
          eventId: 'evt_missing',
          eventType: 'customer.subscription.created',
          kind: StripeWebhookErrorKind.BILLING,
        },
      ],
    ]);
    expect(errors).toEqual([]);
    expect(releasedKeys).toEqual(['stripe:webhook:evt_missing']);
  });

  it.each([
    'invalid_payload',
    'identity_conflict',
    'identity_ambiguous',
  ] as const)(
    'acknowledges deterministic %s with one structured warning and keeps the key',
    async (code) => {
      failWith(new StripeWebhookBillingError(code));

      await expect(deliver()).resolves.toEqual({ success: true });

      expect(warnings).toEqual([
        [
          expect.stringContaining('webhook billing acknowledged'),
          {
            code,
            errorName: 'StripeWebhookBillingError',
            eventId: 'evt_1',
            eventType: 'invoice.paid',
            kind: StripeWebhookErrorKind.BILLING,
          },
        ],
      ]);
      expect(errors).toEqual([]);
      expect(releasedKeys).toEqual([]);
      expect(claimedKeys.has('stripe:webhook:evt_1')).toBe(true);
    },
  );
});
