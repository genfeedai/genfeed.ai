import { resolveBrandKitGenerationSize } from '@api/collections/assets/utils/brand-kit-generation-size.util';
import { describe, expect, it } from 'vitest';

describe('resolveBrandKitGenerationSize', () => {
  it.each([
    [2560, 1440, { height: 864, width: 1536 }],
    [4200, 700, { height: 256, width: 1536 }],
    [400, 400, { height: 400, width: 400 }],
    [851, 315, { height: 320, width: 848 }],
  ])('%sx%s generates at %o', (width, height, expected) => {
    expect(resolveBrandKitGenerationSize(width, height)).toEqual(expected);
  });
});
