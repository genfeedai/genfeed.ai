import {
  getStripeWebhookErrorDiagnostics,
  mapStripeWebhookError,
  StripeWebhookErrorKind,
  toStripeWebhookException,
} from '@api/endpoints/webhooks/stripe/stripe-webhook-error.util';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('stripe-webhook-error.util', () => {
  describe('mapStripeWebhookError', () => {
    it('maps signature verification failures to a 400, not a 500', () => {
      const mapping = mapStripeWebhookError({
        name: 'StripeSignatureVerificationError',
        type: 'StripeSignatureVerificationError',
      });

      expect(mapping).toEqual({
        kind: StripeWebhookErrorKind.SIGNATURE,
        shouldAcknowledge: false,
        shouldReleaseIdempotencyKey: false,
        shouldReportAsFault: false,
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('maps Invalid Stripe signature BadRequestException to SIGNATURE', () => {
      const mapping = mapStripeWebhookError(
        new BadRequestException('Invalid Stripe signature'),
      );

      expect(mapping.kind).toBe(StripeWebhookErrorKind.SIGNATURE);
      expect(mapping.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mapping.shouldReportAsFault).toBe(false);
    });

    it('maps Prisma P2002 unique-constraint races to an idempotent replay ack', () => {
      const mapping = mapStripeWebhookError({ code: 'P2002' });

      expect(mapping).toEqual({
        kind: StripeWebhookErrorKind.REPLAY,
        shouldAcknowledge: true,
        shouldReleaseIdempotencyKey: false,
        shouldReportAsFault: false,
        status: HttpStatus.OK,
      });
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

    it('classifies unknown errors as retryable faults', () => {
      const mapping = mapStripeWebhookError(new Error('db timeout'));

      expect(mapping).toEqual({
        kind: StripeWebhookErrorKind.FAULT,
        shouldAcknowledge: false,
        shouldReleaseIdempotencyKey: true,
        shouldReportAsFault: true,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });

    it('keeps an existing 5xx HttpException as a fault', () => {
      const mapping = mapStripeWebhookError(
        new HttpException('downstream', HttpStatus.BAD_GATEWAY),
      );

      expect(mapping.kind).toBe(StripeWebhookErrorKind.FAULT);
      expect(mapping.status).toBe(HttpStatus.BAD_GATEWAY);
      expect(mapping.shouldReportAsFault).toBe(true);
    });
  });

  describe('getStripeWebhookErrorDiagnostics', () => {
    it('includes event identity without payment fields', () => {
      expect(
        getStripeWebhookErrorDiagnostics(new Error('db timeout'), {
          id: 'evt_123',
          type: 'invoice.paid',
        }),
      ).toEqual({
        errorName: 'Error',
        eventId: 'evt_123',
        eventType: 'invoice.paid',
        kind: StripeWebhookErrorKind.FAULT,
      });
    });

    it('omits event fields when the payload was never trusted', () => {
      expect(
        getStripeWebhookErrorDiagnostics(
          new BadRequestException('Invalid Stripe signature'),
        ),
      ).toEqual({
        errorName: 'BadRequestException',
        kind: StripeWebhookErrorKind.SIGNATURE,
      });
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
