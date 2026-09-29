import { isDeferredCreditsRequest } from './generation-credit-cost.util';

describe('generation credit cost helpers', () => {
  describe('deferred request guards', () => {
    it('ignores requests without deferred credit metadata', () => {
      expect(isDeferredCreditsRequest({})).toBe(false);
      expect(
        isDeferredCreditsRequest({ creditsConfig: { deferred: false } }),
      ).toBe(false);
    });
  });
});
