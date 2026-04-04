import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  StripePrice: class BaseStripePrice {
    public interval?: string;
    public unitAmount: number = 0;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  StripeUrl: class BaseStripeUrl {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { StripePrice, StripeUrl } from '@models/billing/stripe.model';

describe('StripePrice', () => {
  describe('description', () => {
    it('should return monthly description for monthly interval', () => {
      const price = new StripePrice({
        interval: 'month',
        unitAmount: 4999,
      } as never);
      expect(price.description).toBe('Unlimited usage per month');
    });

    it('should return PAYG description for non-monthly interval', () => {
      const price = new StripePrice({
        interval: 'year',
        unitAmount: 49900,
      } as never);
      expect(price.description).toBe('Pay as you go');
    });

    it('should return PAYG description when interval is undefined', () => {
      const price = new StripePrice({ unitAmount: 1000 } as never);
      expect(price.description).toBe('Pay as you go');
    });
  });

  describe('price', () => {
    it('should convert unitAmount from cents to dollars', () => {
      const price = new StripePrice({ unitAmount: 4999 } as never);
      expect(price.price).toBe(49.99);
    });

    it('should handle zero amount', () => {
      const price = new StripePrice({ unitAmount: 0 } as never);
      expect(price.price).toBe(0);
    });

    it('should handle large amounts', () => {
      const price = new StripePrice({ unitAmount: 499900 } as never);
      expect(price.price).toBe(4999);
    });

    it('should handle small amounts', () => {
      const price = new StripePrice({ unitAmount: 1 } as never);
      expect(price.price).toBe(0.01);
    });
  });

  describe('features', () => {
    it('should return monthly features for monthly interval', () => {
      const price = new StripePrice({
        interval: 'month',
        unitAmount: 0,
      } as never);
      const features = price.features ?? [];
      expect(features).toHaveLength(3);
      expect(features[0]).toBe('Unlimited usage per month');
    });

    it('should return PAYG features for non-monthly interval', () => {
      const price = new StripePrice({
        interval: 'year',
        unitAmount: 0,
      } as never);
      const features = price.features ?? [];
      expect(features).toEqual(['no roll over']);
    });
  });
});

describe('StripeUrl', () => {
  it('should create an instance', () => {
    const url = new StripeUrl({
      url: 'https://checkout.stripe.com/pay/123',
    } as never);
    expect(url).toBeDefined();
  });
});
