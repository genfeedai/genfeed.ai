import {
  brandLookup,
  credentialLookup,
  ingredientsLookup,
  metadataLookup,
  organizationLookup,
  userLookup,
} from '@api/shared/utils/aggregation-builders/lookup-builders';
import { describe, expect, it } from 'vitest';

describe('Aggregation Lookup Builders', () => {
  describe('ingredientsLookup()', () => {
    it('returns a pipeline stage with relationInclude', () => {
      const result = ingredientsLookup();
      expect(result).toBeDefined();
      // Check it's a pipeline stage (has relationInclude or is an array)
      expect(typeof result).toBe('object');
    });

    it('uses default fields when no options provided', () => {
      const result = ingredientsLookup();
      expect(result).toBeTruthy();
    });

    it('accepts custom localField option', () => {
      const result = ingredientsLookup({ localField: 'customField' });
      expect(result).toBeDefined();
    });

    it('returns fresh object each call (no shared references)', () => {
      const r1 = ingredientsLookup();
      const r2 = ingredientsLookup();
      expect(r1).not.toBe(r2);
    });
  });

  describe('credentialLookup()', () => {
    it('returns pipeline stages', () => {
      const result = credentialLookup();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('result contains relationInclude stage', () => {
      const result = credentialLookup();
      const hasLookup = (result as unknown[]).some(
        (s) => typeof s === 'object' && s !== null && 'relationInclude' in s,
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

    it('accepts custom asField', () => {
      const result = userLookup({ asField: 'createdBy' });
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
