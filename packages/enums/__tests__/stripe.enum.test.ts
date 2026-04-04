import { describe, expect, it } from 'vitest';
import { StripeCheckoutMode } from '../src/stripe.enum';

describe('stripe.enum', () => {
  describe('StripeCheckoutMode', () => {
    it('should have 2 members', () => {
      expect(Object.values(StripeCheckoutMode)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(StripeCheckoutMode.SUBSCRIPTION).toBe('subscription');
      expect(StripeCheckoutMode.PAYMENT).toBe('payment');
    });
  });
});
