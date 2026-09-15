import { normalizeSourcePostFlags } from '@api/services/source-collector/source-post-flags';

describe('provider eligibility flags', () => {
  it.each(['isPinned', 'is_pinned', 'pinned'])('retains boolean %s', (key) =>
    expect(normalizeSourcePostFlags({ [key]: true }).isPinned).toBe(true),
  );
  it.each([
    'isPromoted',
    'is_promoted',
    'promoted',
    'isSponsored',
    'is_sponsored',
  ])('retains boolean %s', (key) =>
    expect(normalizeSourcePostFlags({ [key]: false }).isPromoted).toBe(false),
  );
  it('keeps missing and invalid provider fields unknown', () =>
    expect(
      normalizeSourcePostFlags({ isPinned: 'false', isPromoted: 0 }),
    ).toEqual({ isPinned: null, isPromoted: null }));
});
