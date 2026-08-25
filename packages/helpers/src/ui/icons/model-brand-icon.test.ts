import { describe, expect, it } from 'vitest';
import { getModelBrandIcon } from './model-brand-icon';

const CATALOG_ICON_KEYS = [
  'anthropic',
  'argil',
  'bytedance',
  'deepseek',
  'fal',
  'flux',
  'genfeed',
  'google',
  'heygen',
  'higgsfield',
  'ideogram',
  'kling',
  'local',
  'luma',
  'meta',
  'minimax',
  'moonshot',
  'openai',
  'pruna',
  'qwen',
  'replicate',
  'runway',
  'topaz',
  'wan',
  'xai',
] as const;

describe('getModelBrandIcon', () => {
  it('resolves a local SVG for every catalog brand icon key', () => {
    const unresolved = CATALOG_ICON_KEYS.filter(
      (iconKey) => getModelBrandIcon(iconKey) === undefined,
    );

    expect(unresolved).toEqual([]);
  });

  it('returns nothing for an unknown key', () => {
    expect(getModelBrandIcon('logo-dev')).toBeUndefined();
    expect(getModelBrandIcon(undefined)).toBeUndefined();
  });
});
