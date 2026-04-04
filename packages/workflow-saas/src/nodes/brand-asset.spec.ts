import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_ASSET_DATA } from './brand-asset';

describe('brand-asset node', () => {
  describe('DEFAULT_BRAND_ASSET_DATA', () => {
    it('should have label set to Brand Asset', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.label).toBe('Brand Asset');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.status).toBe('idle');
    });

    it('should default assetType to logo', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.assetType).toBe('logo');
    });

    it('should default brandId to null', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.brandId).toBeNull();
    });

    it('should default resolvedUrl to null', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.resolvedUrl).toBeNull();
    });

    it('should default resolvedUrls to empty array', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.resolvedUrls).toEqual([]);
    });

    it('should default dimensions and mimeType to null', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.dimensions).toBeNull();
      expect(DEFAULT_BRAND_ASSET_DATA.mimeType).toBeNull();
    });

    it('should default brandLabel to null', () => {
      expect(DEFAULT_BRAND_ASSET_DATA.brandLabel).toBeNull();
    });
  });
});
