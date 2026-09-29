import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_CONTEXT_DATA } from './brand-context';

describe('brand-context node', () => {
  describe('DEFAULT_BRAND_CONTEXT_DATA', () => {
    it('should default to idle status', () => {
      expect(DEFAULT_BRAND_CONTEXT_DATA.status).toBe('idle');
    });
  });
});
