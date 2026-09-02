import { describe, expect, it } from 'vitest';
import { TagCategory, TagKey } from '../../src/enums/tag.enum';

describe('tag.enum', () => {
  describe('TagCategory', () => {
    it('should have 5 members', () => {
      expect(Object.values(TagCategory)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(TagCategory.ORGANIZATION).toBe('ORGANIZATION');
      expect(TagCategory.CREDENTIAL).toBe('CREDENTIAL');
      expect(TagCategory.INGREDIENT).toBe('INGREDIENT');
      expect(TagCategory.PROMPT).toBe('PROMPT');
      expect(TagCategory.ARTICLE).toBe('ARTICLE');
    });
  });

  describe('TagKey', () => {
    it('should have 10 members', () => {
      expect(Object.values(TagKey)).toHaveLength(10);
    });

    it('should have correct values', () => {
      expect(TagKey.ENHANCED).toBe('enhanced');
      expect(TagKey.RESIZED).toBe('resized');
      expect(TagKey.UPSCALED).toBe('upscaled');
      expect(TagKey.REVERSED).toBe('reversed');
      expect(TagKey.MERGED).toBe('merged');
      expect(TagKey.SPLITTED).toBe('splitted');
      expect(TagKey.CLONED).toBe('cloned');
      expect(TagKey.CONVERTED).toBe('converted');
      expect(TagKey.MIRRORED).toBe('mirrored');
      expect(TagKey.PORTRAIT_BLUR).toBe('portrait-blur');
    });
  });
});
