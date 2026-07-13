import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_CONTEXT_DATA } from './brand-context';

describe('brand-context node', () => {
  describe('DEFAULT_BRAND_CONTEXT_DATA', () => {
    it('should have label set to Brand Context', () => {
      expect(DEFAULT_BRAND_CONTEXT_DATA.label).toBe('Brand Context');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_BRAND_CONTEXT_DATA.status).toBe('idle');
    });

    it('should default brandId to null', () => {
      expect(DEFAULT_BRAND_CONTEXT_DATA.brandId).toBeNull();
    });

    it('should default all resolved fields to null', () => {
      expect(DEFAULT_BRAND_CONTEXT_DATA.resolvedVoice).toBeNull();
      expect(DEFAULT_BRAND_CONTEXT_DATA.resolvedColors).toBeNull();
      expect(DEFAULT_BRAND_CONTEXT_DATA.resolvedFonts).toBeNull();
      expect(DEFAULT_BRAND_CONTEXT_DATA.resolvedModels).toBeNull();
    });

    it('should default brand metadata to null', () => {
      expect(DEFAULT_BRAND_CONTEXT_DATA.brandLabel).toBeNull();
      expect(DEFAULT_BRAND_CONTEXT_DATA.brandHandle).toBeNull();
    });
  });
});
