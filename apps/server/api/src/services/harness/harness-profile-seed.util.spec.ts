import {
  type HarnessPackSeed,
  mergeSeedIntoExistingExamples,
  packSeedMatchesBrand,
  packSeedToProfilePayload,
} from '@api/services/harness/harness-profile-seed.util';
import { describe, expect, it } from 'vitest';

const seed: HarnessPackSeed = {
  antiExamples: ['generic AI spam'],
  audienceHint: 'founders',
  brandIds: ['brand-1'],
  brandName: 'genfeed.ai',
  brandSlugs: ['genfeed'],
  doNotSoundLike: ['wrapper marketing'],
  examples: ['Ship the OS, not another wrapper.', 'TODO: ignore me'],
  handles: ['@genfeedai'],
  id: 'genfeed-brand',
  offer: 'content OS',
  styleDirectives: ['premium product-led', 'anti-generic'],
  systemDirectives: ['Infrastructure for brand-native content'],
};

describe('harness-profile-seed.util', () => {
  it('matches brands by id, slug, or label', () => {
    expect(packSeedMatchesBrand(seed, { id: 'brand-1', label: 'Other' })).toBe(
      true,
    );
    expect(
      packSeedMatchesBrand(seed, { id: 'x', slug: 'genfeed', label: 'x' }),
    ).toBe(true);
    expect(packSeedMatchesBrand(seed, { id: 'x', label: 'genfeed.ai' })).toBe(
      true,
    );
    expect(packSeedMatchesBrand(seed, { id: 'x', label: 'Nope' })).toBe(false);
  });

  it('maps a pack seed into a harness profile payload and drops TODO examples', () => {
    const payload = packSeedToProfilePayload(seed, 'brand-1');
    expect(payload.brandId).toBe('brand-1');
    expect(payload.examples.good).toEqual([
      'Ship the OS, not another wrapper.',
    ]);
    expect(payload.examples.avoid).toEqual(['generic AI spam']);
    expect(payload.voice.bannedPhrases).toContain('wrapper marketing');
    expect(payload.thesis.offers).toEqual(['content OS']);
    expect(payload.handles.handle1).toBe('@genfeedai');
  });

  it('merges seed examples into existing profile examples without duplicates', () => {
    const merged = mergeSeedIntoExistingExamples(
      { avoid: ['generic AI spam'], good: ['Existing on-brand line'] },
      seed,
    );
    expect(merged.good).toEqual([
      'Existing on-brand line',
      'Ship the OS, not another wrapper.',
    ]);
    expect(merged.avoid).toEqual(['generic AI spam']);
  });
});
