import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import {
  mapStripeWebhookError,
  StripeWebhookErrorKind,
  toStripeWebhookException,
} from '@api/endpoints/webhooks/stripe/stripe-webhook-error.util';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('stripe-webhook-error.util', () => {
  describe('mapStripeWebhookError', () => {
    it('maps Invalid Stripe signature BadRequestException to SIGNATURE', () => {
      const mapping = mapStripeWebhookError(
        new BadRequestException('Invalid Stripe signature'),
      );

      expect(mapping.kind).toBe(StripeWebhookErrorKind.SIGNATURE);
      expect(mapping.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mapping.shouldReportAsFault).toBe(false);
    });

    it('passes through expected 4xx HttpExceptions without remapping to 500', () => {
      const mapping = mapStripeWebhookError(
        new BadRequestException('Managed checkout is not configured'),
      );

      expect(mapping.kind).toBe(StripeWebhookErrorKind.EXPECTED);
      expect(mapping.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mapping.shouldReportAsFault).toBe(false);
      expect(mapping.shouldReleaseIdempotencyKey).toBe(false);
    });

    it.each([
      'invalid_payload',
      'identity_conflict',
      'identity_ambiguous',
    ] as const)(
      'acknowledges deterministic %s like a replay and keeps the event key',
      (code) => {
        const mapping = mapStripeWebhookError(
          new StripeWebhookBillingError(code),
        );

        expect(mapping).toEqual({
          kind: StripeWebhookErrorKind.BILLING,
          shouldAcknowledge: true,
          shouldReleaseIdempotencyKey: false,
          shouldReportAsFault: false,
          status: HttpStatus.OK,
        });
      },
    );

    it('keeps an existing 5xx HttpException as a fault', () => {
      const mapping = mapStripeWebhookError(
        new HttpException('downstream', HttpStatus.BAD_GATEWAY),
      );

      expect(mapping.kind).toBe(StripeWebhookErrorKind.FAULT);
      expect(mapping.status).toBe(HttpStatus.BAD_GATEWAY);
      expect(mapping.shouldReportAsFault).toBe(true);
    });
  });

  describe('toStripeWebhookException', () => {
    it('wraps a raw Stripe signature error as BadRequestException', () => {
      const exception = toStripeWebhookException({
        type: 'StripeSignatureVerificationError',
      });

      expect(exception).toBeInstanceOf(BadRequestException);
      expect((exception as BadRequestException).getStatus()).toBe(
        HttpStatus.BAD_REQUEST,
      );
      expect((exception as BadRequestException).message).toBe(
        'Invalid Stripe signature',
      );
    });

    it('leaves classified HttpExceptions and faults unchanged', () => {
      const expected = new BadRequestException('missing');
      const fault = new Error('boom');

      expect(toStripeWebhookException(expected)).toBe(expected);
      expect(toStripeWebhookException(fault)).toBe(fault);
    });
  });
});
