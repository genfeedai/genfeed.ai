import {
  brandLookup,
  credentialLookup,
  ingredientLookup,
  metadataLookup,
  organizationLookup,
  userLookup,
} from '@api/shared/utils/aggregation-builders/lookup-builders';
import { describe, expect, it } from 'vitest';

describe('Aggregation Lookup Builders', () => {
  describe('ingredientLookup()', () => {
    it('returns an include stage for ingredients by default', () => {
      const result = ingredientLookup();
      expect(result).toEqual([{ include: { ingredients: true } }]);
    });

    it('uses custom alias', () => {
      const result = ingredientLookup({ as: 'assets' });
      expect(result).toEqual([{ include: { assets: true } }]);
    });

    it('marks include as required when preserveNull is false', () => {
      const result = ingredientLookup({ preserveNull: false });
      expect(result).toEqual([
        { include: { ingredients: true }, required: true },
      ]);
    });

    it('returns fresh object each call (no shared references)', () => {
      const r1 = ingredientLookup();
      const r2 = ingredientLookup();
      expect(r1).not.toBe(r2);
    });
  });

  describe('credentialLookup()', () => {
    it('returns pipeline stages', () => {
      const result = credentialLookup();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('result contains include stage', () => {
      const result = credentialLookup();
      const hasLookup = (result as unknown[]).some(
        (s) => typeof s === 'object' && s !== null && 'include' in s,
      );
      expect(hasLookup).toBe(true);
    });
  });

  describe('metadataLookup()', () => {
    it('returns pipeline stages array', () => {
      const result = metadataLookup();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('userLookup()', () => {
    it('returns pipeline stages array', () => {
      const result = userLookup();
      expect(Array.isArray(result)).toBe(true);
    });

    it('accepts custom alias', () => {
      const result = userLookup({ as: 'createdBy' });
      expect(result).toEqual([{ include: { createdBy: true } }]);
    });
  });

  describe('brandLookup()', () => {
    it('returns pipeline stages array', () => {
      const result = brandLookup();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('organizationLookup()', () => {
    it('returns pipeline stages array', () => {
      const result = organizationLookup();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
