import { describe, expect, it } from 'vitest';
import { StripeCheckoutMode } from '../../src/enums/stripe.enum';

describe('stripe.enum', () => {
  describe('StripeCheckoutMode', () => {
    it('should have correct values', () => {
      expect(StripeCheckoutMode.SUBSCRIPTION).toBe('subscription');
      expect(StripeCheckoutMode.PAYMENT).toBe('payment');
    });
  });
});
