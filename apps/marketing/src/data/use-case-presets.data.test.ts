import { buildPresetPages } from '@data/presets.data';
import { catalogWithExamples } from '@data/presets.fixture';
import { PRESET_CATALOG } from '@genfeedai/contracts/constants/preset-catalog.constant';
import { describe, expect, it } from 'vitest';
import {
  assertUseCasePresetKeys,
  getUseCasePresetPages,
  getUseCasesForPreset,
} from './use-case-presets.data';
import { getUseCaseBySlug, useCases } from './use-cases.data';

const CATALOG_KEYS = PRESET_CATALOG.map((preset) => preset.key);

describe('use case presets', () => {
  it('names at least two catalog presets on every use case, each once', () => {
    for (const useCase of useCases) {
      expect(useCase.presetKeys.length, useCase.slug).toBeGreaterThanOrEqual(2);
      expect(new Set(useCase.presetKeys).size, useCase.slug).toBe(
        useCase.presetKeys.length,
      );
      for (const key of useCase.presetKeys)
        expect(CATALOG_KEYS, `${useCase.slug}: ${key}`).toContain(key);
    }
  });

  it('fails when a use case names a preset the catalog does not have', () => {
    expect(() =>
      assertUseCasePresetKeys(
        [{ presetKeys: ['studio-meme', 'no-such-preset'], slug: 'creators' }],
        CATALOG_KEYS,
      ),
    ).toThrow(/"creators" names preset "no-such-preset"/);
  });

  it('shows only the named presets that have a page, in the order the use case names them', () => {
    const creators = getUseCaseBySlug('creators');
    if (!creators) throw new Error('creators use case missing');

    expect(getUseCasePresetPages(creators, [])).toEqual([]);
    const pages = buildPresetPages(
      catalogWithExamples([
        'studio-meme',
        'studio-youtube-thumbnail',
        'ad-ugc-selfie',
      ]),
    );
    expect(getUseCasePresetPages(creators, pages).map((p) => p.key)).toEqual([
      'studio-youtube-thumbnail',
      'studio-meme',
    ]);
  });

  it('links back from a preset to every use case that names it', () => {
    expect(getUseCasesForPreset('ad-ugc-selfie')).toEqual([
      { audience: 'AI Influencers', slug: 'ai-influencers' },
      { audience: 'Agencies', slug: 'agencies' },
      { audience: 'E-Commerce', slug: 'ecommerce' },
    ]);
    expect(getUseCasesForPreset('studio-edit-retouch')).toEqual([]);
  });
});
