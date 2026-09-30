import { describe, expect, it } from 'vitest';
import { AssetCategory, AssetParent } from '../../src/enums/asset.enum';

describe('asset.enum', () => {
  describe('AssetCategory', () => {
    it('should have 3 members', () => {
      expect(Object.values(AssetCategory)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(AssetCategory.LOGO).toBe('LOGO');
      expect(AssetCategory.BANNER).toBe('BANNER');
      expect(AssetCategory.REFERENCE).toBe('REFERENCE');
    });
  });

  describe('AssetParent', () => {
    it('should have 4 members', () => {
      expect(Object.values(AssetParent)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(AssetParent.ORGANIZATION).toBe('ORGANIZATION');
      expect(AssetParent.INGREDIENT).toBe('INGREDIENT');
      expect(AssetParent.BRAND).toBe('BRAND');
      expect(AssetParent.ARTICLE).toBe('ARTICLE');
    });
  });
});
