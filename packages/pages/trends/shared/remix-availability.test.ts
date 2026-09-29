import { BrandRemixOrganicPlatform } from '@genfeedai/contracts/api-types/contracts';
import { describe, expect, it } from 'vitest';
import { getTrendRemixAvailability } from './remix-availability';

describe('getTrendRemixAvailability', () => {
  it('opens Discovery remix when the source already uses the remix X enum', () => {
    const result = getTrendRemixAvailability(
      BrandRemixOrganicPlatform.X,
      true,
      true,
    );

    expect(result.opensPrefilledRemix).toBe(true);
  });

  it('has no remix path on a platform that is neither Discovery nor variation-eligible', () => {
    const result = getTrendRemixAvailability('reddit', true, true);

    expect(result).toEqual({
      isRemixUnavailable: false,
      opensPrefilledRemix: false,
      opensRemixPage: false,
    });
  });
});
