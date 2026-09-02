import {
  getStripeErrorCode,
  isStripeResourceMissingError,
  isStripeSignatureVerificationError,
} from '@api/services/integrations/stripe/services/stripe-error.util';
import { describe, expect, it } from 'vitest';

describe('stripe-error.util', () => {
  describe('getStripeErrorCode', () => {
    it('reads a top-level Stripe code', () => {
      expect(getStripeErrorCode({ code: 'resource_missing' })).toBe(
        'resource_missing',
      );
    });

    it('falls back to the raw Stripe error code', () => {
      expect(getStripeErrorCode({ raw: { code: 'resource_missing' } })).toBe(
        'resource_missing',
      );
    });

    it('returns undefined for non-objects', () => {
      expect(getStripeErrorCode('nope')).toBeUndefined();
      expect(getStripeErrorCode(null)).toBeUndefined();
    });
  });

  describe('isStripeResourceMissingError', () => {
    it('is true for Stripe resource_missing', () => {
      expect(isStripeResourceMissingError({ code: 'resource_missing' })).toBe(
        true,
      );
    });

    it('is false for other Stripe codes', () => {
      expect(isStripeResourceMissingError({ code: 'card_declined' })).toBe(
        false,
      );
    });
  });

  describe('isStripeSignatureVerificationError', () => {
    it('is true for the Stripe signature type', () => {
      expect(
        isStripeSignatureVerificationError({
          type: 'StripeSignatureVerificationError',
        }),
      ).toBe(true);
    });

    it('is true for the Stripe signature error name', () => {
      expect(
        isStripeSignatureVerificationError({
          name: 'StripeSignatureVerificationError',
        }),
      ).toBe(true);
    });

    it('is false for generic errors', () => {
      expect(isStripeSignatureVerificationError(new Error('boom'))).toBe(false);
    });
  });
});
