import { BrandFontAssetSerializer } from '@serializers/server/organizations/brand-font-asset.serializer';
import { describe, expect, it } from 'vitest';

const row = {
  id: 'font',
  parentBrandId: 'brand',
  parentOrgId: 'private-org',
  userId: 'private-user',
  cloudObjectKey: 'private-key',
  sha256: 'a'.repeat(64),
  category: 'FONT',
  mimeType: 'font/woff2',
  sizeBytes: 48,
  originalFileName: 'Acme.woff2',
  displayName: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  isDeleted: false,
  url: 'private-url',
  rawBytes: 'private-bytes',
  family: 'private-family',
  qualified: true,
};
describe('Font serializer public allowlist', () => {
  it('derives brand/hash and excludes internals from the full JSONAPI document', () => {
    const document = BrandFontAssetSerializer.serialize(row);
    expect(document.data).toMatchObject({
      id: 'font',
      type: 'brand-font-asset',
      attributes: { brandId: 'brand', contentHash: `sha256:${row.sha256}` },
    });
    const output = JSON.stringify(document);
    for (const key of [
      'parentOrgId',
      'parentBrandId',
      'userId',
      'cloudObjectKey',
      'sha256',
      'url',
      'rawBytes',
      'family',
      'qualified',
    ])
      expect(output).not.toContain(`"${key}"`);
    for (const value of [
      'private-org',
      'private-user',
      'private-key',
      'private-url',
      'private-bytes',
      'private-family',
    ])
      expect(output).not.toContain(value);
  });
  it('rejects malformed raw hash and missing brand defensively', () => {
    expect(() =>
      BrandFontAssetSerializer.serialize({ ...row, sha256: 'BAD' }),
    ).toThrow('font_asset_unavailable');
    expect(() =>
      BrandFontAssetSerializer.serialize({ ...row, parentBrandId: null }),
    ).toThrow('font_asset_unavailable');
  });
});

it('preserves all astral filename code points without normalization', () => {
  const originalFileName = `${'😀'.repeat(250)}.woff2`;
  expect(
    BrandFontAssetSerializer.serialize({ ...row, originalFileName }).data,
  ).toMatchObject({ attributes: { originalFileName } });
});
