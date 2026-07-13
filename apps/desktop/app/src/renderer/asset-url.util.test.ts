import type { IDesktopAsset } from '@genfeedai/desktop-contracts';
import { describe, expect, it } from 'vitest';
import { hasLocalAssetCopy, resolveDesktopAssetUrl } from './asset-url.util';

const buildAsset = (residency: IDesktopAsset['residency']): IDesktopAsset => ({
  createdAt: '2026-07-13T00:00:00.000Z',
  displayName: 'Example',
  id: 'asset-1',
  kind: 'image',
  mimeType: 'image/png',
  organizationId: 'local-org',
  origin: 'local-import',
  originalFileName: 'example.png',
  residency,
  sha256: 'abc123',
  sizeBytes: 3,
  updatedAt: '2026-07-13T00:00:00.000Z',
  uploadPolicy: 'never',
  workspaceId: 'workspace-1',
});

describe('desktop asset URL resolution', () => {
  it('uses the opaque protocol for assets with a local copy', () => {
    const asset = buildAsset('local-only');

    expect(hasLocalAssetCopy(asset)).toBe(true);
    expect(resolveDesktopAssetUrl(asset)).toBe('genfeed-asset://local/asset-1');
  });

  it('uses a signed cloud URL when no local copy exists', () => {
    const asset = buildAsset('cloud-only');

    expect(hasLocalAssetCopy(asset)).toBe(false);
    expect(
      resolveDesktopAssetUrl(
        asset,
        'https://cdn.genfeed.ai/signed/example.png?token=secret',
      ),
    ).toBe('https://cdn.genfeed.ai/signed/example.png?token=secret');
  });

  it('does not expose file URLs as cloud fallbacks', () => {
    expect(resolveDesktopAssetUrl(buildAsset('missing-local'))).toBeNull();
    expect(
      resolveDesktopAssetUrl(
        buildAsset('cloud-only'),
        'file:///tmp/private.png',
      ),
    ).toBeNull();
  });
});
