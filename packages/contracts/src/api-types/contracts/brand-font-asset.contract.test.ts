import { describe, expect, it } from 'vitest';
import {
  brandFontAssetListQueryV1Schema,
  brandFontAssetPageV1Schema,
  brandFontAssetReadV1Schema,
} from './brand-font-asset.contract';

const font = {
  id: 'font',
  brandId: 'brand',
  category: 'FONT',
  mimeType: 'font/woff2',
  contentHash: `sha256:${'a'.repeat(64)}`,
  sizeBytes: 48,
  displayName: null,
  originalFileName: 'Acme.woff2',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  isDeleted: false,
};
describe('Strict public brand font contract', () => {
  it('accepts exact read/page/query shapes', () => {
    expect(brandFontAssetReadV1Schema.parse(font)).toEqual(font);
    expect(
      brandFontAssetPageV1Schema.parse({ items: [font], nextCursor: null })
        .items,
    ).toHaveLength(1);
    expect(brandFontAssetListQueryV1Schema.parse({ limit: 50 })).toEqual({
      limit: 50,
    });
  });
  it.each([
    'organizationId',
    'userId',
    'cloudObjectKey',
    'url',
    'rawBytes',
    'family',
    'qualified',
    'sha256',
  ])('rejects private key %s', (key) => {
    expect(
      brandFontAssetReadV1Schema.safeParse({ ...font, [key]: 'private' })
        .success,
    ).toBe(false);
  });
  it.each([
    { contentHash: 'a'.repeat(64) },
    { contentHash: `sha256:${'A'.repeat(64)}` },
    { sizeBytes: 47 },
    { sizeBytes: 4194305 },
    { isDeleted: true },
    { category: 'LOGO' },
    { createdAt: '2026-10-01T00:00:00Z' },
  ])('rejects invalid public identity %s', (change) => {
    expect(
      brandFontAssetReadV1Schema.safeParse({ ...font, ...change }).success,
    ).toBe(false);
  });
  it.each([
    {},
    { limit: 1.5 },
    { limit: 0 },
    { cursor: null },
    { limit: '20' },
    { organizationId: 'org' },
  ])('keeps query typed/strict %s', (query) => {
    expect(brandFontAssetListQueryV1Schema.safeParse(query).success).toBe(
      Object.keys(query).length === 0,
    );
  });
});

it('aligns Unicode filename and displayName units with upload admission', () => {
  const originalFileName = `${'😀'.repeat(250)}.woff2`;
  expect(
    brandFontAssetReadV1Schema.parse({
      ...font,
      originalFileName,
      displayName: '😀'.repeat(128),
    }).originalFileName,
  ).toBe(originalFileName);
  for (const change of [
    { originalFileName: `${'😀'.repeat(251)}.woff2` },
    { displayName: '😀'.repeat(129) },
    { originalFileName: '' },
    { originalFileName: 42 },
  ])
    expect(
      brandFontAssetReadV1Schema.safeParse({ ...font, ...change }).success,
    ).toBe(false);
  expect(
    brandFontAssetReadV1Schema.safeParse({ ...font, originalFileName: null })
      .success,
  ).toBe(true);
});
