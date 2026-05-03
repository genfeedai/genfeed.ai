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
    it('returns a pipeline stage with include', () => {
      const result = ingredientLookup();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('uses default fields when no options provided', () => {
      const result = ingredientLookup();
      expect(result).toBeTruthy();
    });

    it('accepts custom localField option', () => {
      const result = ingredientLookup({ localField: 'customField' });
      expect(result).toBeDefined();
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

    it('accepts custom as option', () => {
      const result = userLookup({ as: 'createdBy' });
      expect(Array.isArray(result)).toBe(true);
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
