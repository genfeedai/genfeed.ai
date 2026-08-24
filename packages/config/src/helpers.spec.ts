import { describe, expect, it } from 'vitest';
import { isUnconfiguredSecret, UNCONFIGURED_SECRET_SENTINEL } from './helpers';

describe('isUnconfiguredSecret', () => {
  it('treats the SSM placeholder sentinel as unset', () => {
    expect(isUnconfiguredSecret(UNCONFIGURED_SECRET_SENTINEL)).toBe(true);
    expect(isUnconfiguredSecret(`  ${UNCONFIGURED_SECRET_SENTINEL}  `)).toBe(
      true,
    );
  });

  it('leaves real values and empty strings alone', () => {
    expect(isUnconfiguredSecret('twitter-client-id-value')).toBe(false);
    expect(isUnconfiguredSecret('')).toBe(false);
    expect(isUnconfiguredSecret('   ')).toBe(false);
    expect(isUnconfiguredSecret(undefined)).toBe(false);
  });
});
