import { normalizeGoogleAdsCustomerId } from '@api/services/integrations/google-ads/services/google-ads-customer-id.util';
import { describe, expect, it } from 'vitest';

describe('normalizeGoogleAdsCustomerId', () => {
  it.each([
    ['123-456-7890', '1234567890'],
    ['1234567890', '1234567890'],
  ])('%s -> %s', (customerId, expected) => {
    expect(normalizeGoogleAdsCustomerId(customerId)).toBe(expected);
  });
});
