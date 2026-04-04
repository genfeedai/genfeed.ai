import { describe, expect, it } from 'vitest';
import { AssetCategory, AssetParent } from '../src/asset.enum';

describe('asset.enum', () => {
  describe('AssetCategory', () => {
    it('should have 3 members', () => {
      expect(Object.values(AssetCategory)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(AssetCategory.LOGO).toBe('logo');
      expect(AssetCategory.BANNER).toBe('banner');
      expect(AssetCategory.REFERENCE).toBe('reference');
    });
  });

  describe('AssetParent', () => {
    it('should have 4 members', () => {
      expect(Object.values(AssetParent)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(AssetParent.ORGANIZATION).toBe('Organization');
      expect(AssetParent.INGREDIENT).toBe('Ingredient');
      expect(AssetParent.BRAND).toBe('Brand');
      expect(AssetParent.ARTICLE).toBe('Article');
    });
  });
});
