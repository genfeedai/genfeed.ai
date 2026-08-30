import { describe, expect, it } from 'bun:test';
import { inferDesktopAssetKind } from './asset-mime.util';

describe('inferDesktopAssetKind', () => {
  it.each([
    ['image/png', 'image'],
    ['video/mp4', 'video'],
    ['audio/mpeg', 'audio'],
    ['application/pdf', 'document'],
    ['', 'document'],
  ] as const)('maps %s to %s', (mimeType, expectedKind) => {
    expect(inferDesktopAssetKind(mimeType)).toBe(expectedKind);
  });
});
