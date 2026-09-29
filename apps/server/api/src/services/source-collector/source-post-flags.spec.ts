import { normalizeSourcePostFlags } from '@api/services/source-collector/source-post-flags';

describe('provider eligibility flags', () => {
  it.each([
    'isPromoted',
    'is_promoted',
    'promoted',
    'isSponsored',
    'is_sponsored',
  ])('retains boolean %s', (key) =>
    expect(normalizeSourcePostFlags({ [key]: false }).isPromoted).toBe(false),
  );
});
