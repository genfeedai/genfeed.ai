import { describe, expect, it } from 'vitest';
import {
  canSyncAssetMetadata,
  canUploadAssetContent,
} from './asset-sync-policy';

describe('desktop asset sync policy', () => {
  it('never syncs metadata or bytes for uploadPolicy=never', () => {
    expect(
      canSyncAssetMetadata({
        origin: 'local-generation',
        uploadPolicy: 'never',
      }),
    ).toBe(false);
    expect(canUploadAssetContent('never', true)).toBe(false);
  });

  it('uploads full asset bytes only after explicit consent and full policy', () => {
    expect(canUploadAssetContent('full', false)).toBe(false);
    expect(canUploadAssetContent('metadata-only', true)).toBe(false);
    expect(canUploadAssetContent('full', true)).toBe(true);
  });
});
