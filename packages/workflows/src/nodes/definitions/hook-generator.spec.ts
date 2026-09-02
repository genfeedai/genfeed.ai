import { describe, expect, it } from 'vitest';
import { DEFAULT_HOOK_GENERATOR_DATA } from './hook-generator';

describe('hook-generator node', () => {
  describe('DEFAULT_HOOK_GENERATOR_DATA', () => {
    it('should have label set to Hook Generator', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.label).toBe('Hook Generator');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.status).toBe('idle');
    });

    it('should have type set to hookGenerator', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.type).toBe('hookGenerator');
    });

    it('should default hookFormula to curiosity_gap', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.hookFormula).toBe('curiosity_gap');
    });

    it('should default toneStyle to storytelling', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.toneStyle).toBe('storytelling');
    });

    it('should default niche and product to null', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.niche).toBeNull();
      expect(DEFAULT_HOOK_GENERATOR_DATA.product).toBeNull();
    });

    it('should default input connections to null', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.inputTrendData).toBeNull();
      expect(DEFAULT_HOOK_GENERATOR_DATA.inputBrandContext).toBeNull();
    });

    it('should default output text fields to null', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.outputHookText).toBeNull();
      expect(DEFAULT_HOOK_GENERATOR_DATA.outputCaptionHook).toBeNull();
    });

    it('should default output arrays to empty', () => {
      expect(DEFAULT_HOOK_GENERATOR_DATA.outputHashtags).toEqual([]);
      expect(DEFAULT_HOOK_GENERATOR_DATA.outputSlidePrompts).toEqual([]);
    });
  });
});
