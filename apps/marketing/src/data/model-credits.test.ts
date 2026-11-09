import { describe, expect, it } from 'vitest';
import {
  buildModelCredits,
  modelAnchorId,
  modelCatalogHref,
} from './model-credits';

describe('modelAnchorId', () => {
  it.each([
    ['fal-ai/flux-pro/v1.1', 'model-fal-ai-flux-pro-v1-1'],
    ['Veo 3', 'model-veo-3'],
    ['/odd--key/', 'model-odd-key'],
  ])('anchors %s as %s', (key, expected) => {
    expect(modelAnchorId(key)).toBe(expected);
  });
});

describe('modelCatalogHref', () => {
  it('links to the entry on the models page', () => {
    expect(modelCatalogHref('veo-3')).toBe('/models#model-veo-3');
  });
});

describe('buildModelCredits', () => {
  const catalog = [
    { key: 'flux-pro', label: 'Flux Pro' },
    { key: 'veo-3', label: 'Veo 3' },
    { key: 'unused', label: 'Unused' },
  ];

  it('labels only the models that made the media', () => {
    expect(
      buildModelCredits(catalog, [
        { model: 'flux-pro' },
        { model: 'veo-3' },
        { model: 'retired-model' },
        { model: null },
        {},
      ]),
    ).toEqual({ 'flux-pro': 'Flux Pro', 'veo-3': 'Veo 3' });
  });

  it('credits nothing when the catalog is unavailable', () => {
    expect(buildModelCredits(null, [{ model: 'flux-pro' }])).toEqual({});
  });
});
