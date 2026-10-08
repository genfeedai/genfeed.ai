import type { PublicModelCatalogItem } from '@public/models/models-loader';
import { describe, expect, it } from 'vitest';
import { matchesOrientation, selectModels } from './ai-model-selector';

function model(
  key: string,
  overrides: Partial<PublicModelCatalogItem> = {},
): PublicModelCatalogItem {
  return {
    aspectRatios: [],
    capabilities: [],
    category: 'image',
    durations: [],
    id: key,
    isDefault: false,
    isHighlighted: false,
    key,
    label: key,
    provider: 'Provider',
    recommendedFor: [],
    supportsFeatures: [],
    ...overrides,
  };
}

describe('AI model selector', () => {
  it('requires a recorded matching ratio and excludes other output formats', () => {
    const models = [
      model('portrait', { aspectRatios: ['9:16'] }),
      model('unknown'),
      model('landscape', { aspectRatios: ['16:9'] }),
      model('video', { aspectRatios: ['9:16'], category: 'video' }),
    ];
    expect(
      selectModels(models, 'image', 'default', 'portrait').map(
        ({ key }) => key,
      ),
    ).toEqual(['portrait']);
    expect(selectModels(models, 'voice', 'default')).toEqual([]);
  });
  it('rejects malformed or zero aspect ratios', () => {
    for (const ratio of ['0:9', '9:0', '-1:2', 'auto', '16:9:1'])
      expect(matchesOrientation(ratio, 'portrait')).toBe(false);
    expect(matchesOrientation('1:1', 'square')).toBe(true);
    expect(matchesOrientation('16:9', 'landscape')).toBe(true);
  });
  it('puts known cost tiers before missing tiers, even when the unknown model is default', () => {
    const models = [
      model('unknown', { isDefault: true }),
      model('high', { costTier: 'high' }),
      model('low', { costTier: 'low' }),
      model('future', { costTier: 'new-tier' }),
    ];
    expect(selectModels(models, 'image', 'cost').map(({ key }) => key)).toEqual(
      ['low', 'high', 'unknown', 'future'],
    );
  });
  it('sorts by speed and quality without mutating the catalog', () => {
    const models = [
      model('slow', { speedTier: 'slow', qualityTier: 'ultra' }),
      model('fast', { speedTier: 'fast', qualityTier: 'basic' }),
    ];
    expect(selectModels(models, 'image', 'speed')[0].key).toBe('fast');
    expect(selectModels(models, 'image', 'quality')[0].key).toBe('slow');
    expect(models[0].key).toBe('slow');
  });
  it('uses the format default for ties and searches provider, name, and key case-insensitively', () => {
    const models = [
      model('alpha'),
      model('zeta', { isDefault: true, provider: 'Acme' }),
    ];
    expect(selectModels(models, 'image', 'default')[0].key).toBe('zeta');
    expect(
      selectModels(models, 'image', 'default', 'any', ' ACME '),
    ).toHaveLength(1);
    expect(
      selectModels(models, 'image', 'default', 'any', 'not-listed'),
    ).toEqual([]);
  });
});
