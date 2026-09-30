import { PricingType } from '@genfeedai/contracts';

import {
  commitDeferredCredits,
  isDeferredCreditsRequest,
} from './generation-credit-cost.util';

describe('generation credit cost helpers', () => {
  describe('deferred request guards', () => {
    it('ignores requests without deferred credit metadata', () => {
      expect(isDeferredCreditsRequest({})).toBe(false);
      expect(
        isDeferredCreditsRequest({ creditsConfig: { deferred: false } }),
      ).toBe(false);
    });

    it('commits the resolved amount and clears the deferred flag', () => {
      const request = {
        creditsConfig: { amount: 1, deferred: true },
      };

      commitDeferredCredits(request, 40, 'provider/model');

      expect(request.creditsConfig).toEqual({
        amount: 40,
        deferred: false,
        modelKey: 'provider/model',
      });
    });

    it('stores the pricing audit stamp when supplied', () => {
      const request = {
        creditsConfig: { amount: 1, deferred: true },
      };

      commitDeferredCredits(request, 40, 'provider/model', {
        marginMultiplier: 1.2,
        pricingType: PricingType.PER_SECOND,
        providerCostUsd: 0.24,
      });

      expect(request.creditsConfig).toEqual({
        amount: 40,
        deferred: false,
        modelKey: 'provider/model',
        pricingMetadata: {
          marginMultiplier: 1.2,
          pricingType: PricingType.PER_SECOND,
          providerCostUsd: 0.24,
        },
      });
    });
  });
});
