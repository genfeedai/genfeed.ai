import { describe, expect, it } from 'vitest';
import { brandNodeDefinition, DEFAULT_BRAND_DATA } from './brand';

describe('brand node', () => {
  describe('DEFAULT_BRAND_DATA', () => {
    it('should have label set to Brand', () => {
      expect(DEFAULT_BRAND_DATA.label).toBe('Brand');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_BRAND_DATA.status).toBe('idle');
    });

    it('should have type set to brand', () => {
      expect(DEFAULT_BRAND_DATA.type).toBe('brand');
    });

    it('should default brandId to null', () => {
      expect(DEFAULT_BRAND_DATA.brandId).toBeNull();
    });

    it('should default all resolved fields to null', () => {
      expect(DEFAULT_BRAND_DATA.resolvedBrandId).toBeNull();
      expect(DEFAULT_BRAND_DATA.resolvedLabel).toBeNull();
      expect(DEFAULT_BRAND_DATA.resolvedHandle).toBeNull();
      expect(DEFAULT_BRAND_DATA.resolvedVoice).toBeNull();
      expect(DEFAULT_BRAND_DATA.resolvedColors).toBeNull();
      expect(DEFAULT_BRAND_DATA.resolvedFonts).toBeNull();
      expect(DEFAULT_BRAND_DATA.resolvedModels).toBeNull();
      expect(DEFAULT_BRAND_DATA.resolvedLogoUrl).toBeNull();
    });
  });

  describe('brandNodeDefinition', () => {
    it('should have type brand', () => {
      expect(brandNodeDefinition.type).toBe('brand');
    });

    it('should be in input category', () => {
      expect(brandNodeDefinition.category).toBe('input');
    });

    it('should have label Brand', () => {
      expect(brandNodeDefinition.label).toBe('Brand');
    });

    it('should have no inputs (user selects brand in UI)', () => {
      expect(brandNodeDefinition.inputs).toEqual([]);
    });

    it('should output brand, voice, colors, and fonts', () => {
      const outputIds = brandNodeDefinition.outputs.map((o) => o.id);
      expect(outputIds).toEqual(['brand', 'voice', 'colors', 'fonts']);
    });

    it('should reference default data', () => {
      expect(brandNodeDefinition.defaultData).toBe(DEFAULT_BRAND_DATA);
    });
  });
});
