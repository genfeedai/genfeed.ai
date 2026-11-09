import { watermarkLogoIdFor } from '@api/collections/brands/utils/brand-watermark-layer.util';
import { describe, expect, it } from 'vitest';

const base = { watermarkOpacity: 0.35, watermarkPosition: 'bottom-right' };

describe('watermarkLogoIdFor', () => {
  it.each([
    [
      'the brand light pick wins',
      { watermarkLightLogoId: 'pick', watermarkLogoId: 'default' },
      'light',
      'variant',
      'pick',
    ],
    [
      'light footage takes the light-background variant',
      { watermarkLogoId: 'default' },
      'light',
      'variant',
      'variant',
    ],
    [
      'a text-only watermark stays text-only',
      { watermarkLogoId: null },
      'light',
      'variant',
      null,
    ],
    [
      'the default mark ignores the variant',
      { watermarkLogoId: 'default' },
      'default',
      'variant',
      'default',
    ],
    [
      'light footage without a variant keeps the default',
      { watermarkLogoId: 'default' },
      'light',
      null,
      'default',
    ],
  ] as const)('%s', (_name, brand, variant, lightVariantId, expected) => {
    expect(
      watermarkLogoIdFor({ ...base, ...brand }, variant, lightVariantId),
    ).toBe(expected);
  });
});
