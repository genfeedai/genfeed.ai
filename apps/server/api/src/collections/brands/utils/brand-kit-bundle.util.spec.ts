import {
  packBrandKitBundle,
  unpackBrandKitBundle,
} from '@api/collections/brands/utils/brand-kit-bundle.util';
import { BrandKitSlot, FontFamily } from '@genfeedai/contracts';
import type { BrandKitBundleManifest } from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const LOGO = Buffer.from('logo-bytes');
const BANNER = Buffer.from('banner-bytes');
const FONT = Buffer.from('font-bytes');

const MANIFEST: BrandKitBundleManifest = {
  banners: [
    {
      file: 'banners/x_header.png',
      mimeType: 'image/png',
      slot: BrandKitSlot.X_HEADER,
    },
  ],
  brand: { label: 'Acme' },
  colors: { background: 'transparent', primary: '#FF6600' },
  exportedAt: '2026-11-09T10:00:00.000Z',
  fontFamily: FontFamily.INTER_BOLD,
  fontRoles: {
    body: { fontFamily: FontFamily.INTER_BOLD, source: 'preset' },
    heading: {
      family: 'Acme Display',
      file: 'fonts/font-1.woff2',
      source: 'upload',
      style: 'normal',
      weight: 700,
    },
  },
  fonts: [{ file: 'fonts/font-1.woff2', name: 'Acme Display' }],
  format: 'genfeed.brand-kit',
  logos: [
    {
      file: 'logos/logo_primary.png',
      mimeType: 'image/png',
      slot: BrandKitSlot.LOGO_PRIMARY,
    },
  ],
  palette: [{ hex: '#FF6600', name: 'Accent', usage: 'Buttons' }],
  version: 1,
};

function zipOf(entries: Record<string, string | Buffer>): Buffer {
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([path, value]) => [
          path,
          typeof value === 'string'
            ? new TextEncoder().encode(value)
            : new Uint8Array(value),
        ]),
      ),
    ),
  );
}

describe('brand kit bundle', () => {
  it('reads back the manifest and every file it packed', () => {
    const zip = packBrandKitBundle(
      MANIFEST,
      new Map([
        ['logos/logo_primary.png', LOGO],
        ['banners/x_header.png', BANNER],
        ['fonts/font-1.woff2', FONT],
      ]),
    );

    const { manifest, files } = unpackBrandKitBundle(zip);

    expect(manifest).toEqual(MANIFEST);
    expect(Object.fromEntries(files)).toEqual({
      'banners/x_header.png': BANNER,
      'fonts/font-1.woff2': FONT,
      'logos/logo_primary.png': LOGO,
    });
  });

  it('unpacks only the files the manifest names', () => {
    const zip = zipOf({
      '../escape.png': LOGO,
      'logos/logo_primary.png': LOGO,
      'manifest.json': JSON.stringify({
        ...MANIFEST,
        banners: [],
        fontRoles: {},
        fonts: [],
      }),
      'notes/readme.txt': 'hello',
    });

    expect([...unpackBrandKitBundle(zip).files.keys()]).toEqual([
      'logos/logo_primary.png',
    ]);
  });

  it('refuses a ZIP without a manifest', () => {
    expect(() =>
      unpackBrandKitBundle(zipOf({ 'logos/logo_primary.png': LOGO })),
    ).toThrow('brand_kit_manifest_missing');
  });

  it('refuses a manifest from another format', () => {
    expect(() =>
      unpackBrandKitBundle(
        zipOf({
          'manifest.json': JSON.stringify({ ...MANIFEST, format: 'other' }),
        }),
      ),
    ).toThrow('brand_kit_manifest_invalid');
  });

  it('refuses a manifest whose path leaves its folder', () => {
    expect(() =>
      unpackBrandKitBundle(
        zipOf({
          'manifest.json': JSON.stringify({
            ...MANIFEST,
            logos: [
              {
                file: 'logos/../../etc.png',
                mimeType: 'image/png',
                slot: BrandKitSlot.LOGO_PRIMARY,
              },
            ],
          }),
        }),
      ),
    ).toThrow('brand_kit_manifest_invalid');
  });

  it('refuses a file that is not a ZIP', () => {
    expect(() => unpackBrandKitBundle(Buffer.from('not a zip'))).toThrow(
      'brand_kit_bundle_invalid',
    );
  });

  it('leaves out a font larger than the font limit', () => {
    const zip = zipOf({
      'fonts/font-1.woff2': Buffer.alloc(4 * 1024 * 1024 + 1),
      'manifest.json': JSON.stringify(MANIFEST),
    });

    expect(unpackBrandKitBundle(zip).files.has('fonts/font-1.woff2')).toBe(
      false,
    );
  });
});
