import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_DATA } from './brand';

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
  });
});
