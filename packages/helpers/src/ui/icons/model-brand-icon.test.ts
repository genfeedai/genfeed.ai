import { MODEL_BRANDS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import { getModelBrandIcon } from './model-brand-icon';

describe('getModelBrandIcon', () => {
  it('resolves a local SVG for every catalog brand icon key', () => {
    const unresolved = Object.values(MODEL_BRANDS).filter(
      ({ iconKey }) => getModelBrandIcon(iconKey) === undefined,
    );

    expect(unresolved).toEqual([]);
  });

  it('returns nothing for an unknown key', () => {
    expect(getModelBrandIcon('logo-dev')).toBeUndefined();
    expect(getModelBrandIcon(undefined)).toBeUndefined();
  });
});
