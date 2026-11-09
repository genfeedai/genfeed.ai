import { describe, expect, it } from 'vitest';
import { BrandKitSlot } from '../../enums/asset.enum';
import { brandKitBundleManifestSchema } from './brand-kit-bundle.contract';

const MANIFEST = {
  banners: [],
  brand: { label: 'Acme' },
  colors: {},
  exportedAt: '2026-11-09T10:00:00.000Z',
  fontRoles: {},
  fonts: [],
  format: 'genfeed.brand-kit',
  logos: [],
  palette: [],
  version: 1,
};

describe('brandKitBundleManifestSchema', () => {
  it('accepts an empty kit', () => {
    expect(brandKitBundleManifestSchema.safeParse(MANIFEST).success).toBe(true);
  });

  it.each([
    [
      'a banner slot listed as a logo',
      {
        logos: [
          {
            file: 'logos/x_header.png',
            mimeType: 'image/png',
            slot: BrandKitSlot.X_HEADER,
          },
        ],
      },
    ],
    [
      'two images in one slot',
      {
        banners: [
          {
            file: 'banners/a.png',
            mimeType: 'image/png',
            slot: BrandKitSlot.X_HEADER,
          },
          {
            file: 'banners/b.png',
            mimeType: 'image/png',
            slot: BrandKitSlot.X_HEADER,
          },
        ],
      },
    ],
    [
      'a font role naming a font the kit does not list',
      {
        fontRoles: {
          heading: {
            family: 'Acme',
            file: 'fonts/font-1.woff2',
            source: 'upload',
            style: 'normal',
            weight: 700,
          },
        },
      },
    ],
    [
      'an SVG image',
      {
        logos: [
          {
            file: 'logos/logo_primary.svg',
            mimeType: 'image/svg+xml',
            slot: BrandKitSlot.LOGO_PRIMARY,
          },
        ],
      },
    ],
    ['a newer kit version', { version: 2 }],
  ])('refuses %s', (_case, change) => {
    expect(
      brandKitBundleManifestSchema.safeParse({ ...MANIFEST, ...change })
        .success,
    ).toBe(false);
  });
});
