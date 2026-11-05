import { isStripePriceId } from '@api/services/integrations/stripe/services/stripe-price-id.util';
import { describe, expect, it } from 'vitest';

describe('isStripePriceId', () => {
  it.each([
    ['price_1AbCdEf', true],
    ['price_', false],
    ['prod_1AbCdEf', false],
    ['price_1Ab-Cd', false],
    [42, false],
    [undefined, false],
  ])('%s -> %s', (value, expected) => {
    expect(isStripePriceId(value)).toBe(expected);
  });
});
