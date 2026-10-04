import { describe, expect, it } from 'vitest';
import {
  parseTagMatchMode,
  resolveTagScope,
  TagBulkAction,
  TagCategory,
  TagKey,
  TagMatchMode,
  TagScope,
} from '../../src/enums/tag.enum';

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

  describe('TagScope', () => {
    it('derives a brand tag from its brand', () => {
      expect(resolveTagScope({ brandId: 'b', organizationId: 'o' })).toBe(
        TagScope.BRAND,
      );
    });

    it('derives an organization-wide tag from an organization without a brand', () => {
      expect(resolveTagScope({ brandId: null, organizationId: 'o' })).toBe(
        TagScope.ORGANIZATION,
      );
      expect(resolveTagScope({ organizationId: 'o' })).toBe(
        TagScope.ORGANIZATION,
      );
    });

    it('derives a legacy default tag from neither', () => {
      expect(resolveTagScope({ brandId: null, organizationId: null })).toBe(
        TagScope.GLOBAL,
      );
      expect(resolveTagScope({})).toBe(TagScope.GLOBAL);
    });
  });

  describe('TagMatchMode', () => {
    it('has any and all', () => {
      expect(Object.values(TagMatchMode)).toEqual(['any', 'all']);
    });

    it('parses in any case and rejects the rest', () => {
      expect(parseTagMatchMode(' ALL ')).toBe(TagMatchMode.ALL);
      expect(parseTagMatchMode('any')).toBe(TagMatchMode.ANY);
      expect(parseTagMatchMode('both')).toBeUndefined();
      expect(parseTagMatchMode(null)).toBeUndefined();
      expect(parseTagMatchMode(1)).toBeUndefined();
    });
  });

  describe('TagBulkAction', () => {
    it('has add and remove', () => {
      expect(Object.values(TagBulkAction)).toEqual(['add', 'remove']);
    });
  });
});
