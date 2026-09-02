import { AssetScope } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { isPublicAssetScope } from './asset-scope.helper';

describe('isPublicAssetScope', () => {
  it('accepts the lowercase app enum value', () => {
    expect(isPublicAssetScope(AssetScope.PUBLIC)).toBe(true);
  });

  it('accepts the uppercase Prisma wire value', () => {
    expect(isPublicAssetScope('PUBLIC')).toBe(true);
  });

  it('rejects every other scope', () => {
    expect(isPublicAssetScope(AssetScope.BRAND)).toBe(false);
    expect(isPublicAssetScope('ORGANIZATION')).toBe(false);
    expect(isPublicAssetScope('')).toBe(false);
  });

  it('rejects missing values without throwing', () => {
    expect(isPublicAssetScope(undefined)).toBe(false);
    expect(isPublicAssetScope(null)).toBe(false);
  });
});
