import {
  hasValidPendingIds,
  resolvePendingIds,
} from '@utils/network/generation.util';
import { describe, expect, it } from 'vitest';

describe('generation.util', () => {
  describe('resolvePendingIds', () => {
    it('should extract pendingIngredientIds array from batch generation response', () => {
      const response = {
        id: 'main-id',
        pendingIngredientIds: ['id1', 'id2', 'id3'],
      };

      const result = resolvePendingIds(response);

      expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    it('should prefer pendingIngredientIds over single id when both exist', () => {
      const response = {
        id: 'single-id',
        pendingIngredientIds: ['batch1', 'batch2'],
      };

      const result = resolvePendingIds(response);

      expect(result).toEqual(['batch1', 'batch2']);
    });

    it('should fallback to id field for single generation', () => {
      const response = {
        id: 'abc123',
      };

      const result = resolvePendingIds(response);

      expect(result).toEqual(['abc123']);
    });

    it('should throw when only _id is present', () => {
      const response = {
        _id: 'mongo-id-123',
      };

      expect(() => resolvePendingIds(response)).toThrow(
        'No valid ingredient IDs found in generation response',
      );
    });

    it('should ignore empty pendingIngredientIds array and fallback to id', () => {
      const response = {
        id: 'fallback-id',
        pendingIngredientIds: [],
      };

      const result = resolvePendingIds(response);

      expect(result).toEqual(['fallback-id']);
    });

    it('should throw error when response is null', () => {
      expect(() => resolvePendingIds(null)).toThrow(
        'Generation response is null or undefined',
      );
    });

    it('should throw error when response is undefined', () => {
      expect(() => resolvePendingIds(undefined)).toThrow(
        'Generation response is null or undefined',
      );
    });

    it('should throw error when no valid IDs are present', () => {
      const response = {
        model: 'some-model',
        text: 'some text',
      };

      expect(() => resolvePendingIds(response)).toThrow(
        'No valid ingredient IDs found in generation response',
      );
    });

    it('should handle response with only pendingIngredientIds', () => {
      const response = {
        pendingIngredientIds: ['only-pending-id'],
      };

      const result = resolvePendingIds(response);

      expect(result).toEqual(['only-pending-id']);
    });

    it('should filter out null/undefined values from pendingIngredientIds', () => {
      const response = {
        id: 'fallback',
        pendingIngredientIds: null as any,
      };

      const result = resolvePendingIds(response);

      expect(result).toEqual(['fallback']);
    });
  });

  describe('hasValidPendingIds', () => {
    it('should return true for valid batch generation response', () => {
      const response = {
        pendingIngredientIds: ['id1', 'id2'],
      };

      expect(hasValidPendingIds(response)).toBe(true);
    });

    it('should return true for valid single generation response', () => {
      const response = {
        id: 'single-id',
      };

      expect(hasValidPendingIds(response)).toBe(true);
    });

    it('should return false for null response', () => {
      expect(hasValidPendingIds(null)).toBe(false);
    });

    it('should return false for undefined response', () => {
      expect(hasValidPendingIds(undefined)).toBe(false);
    });

    it('should return false for response without IDs', () => {
      const response = {
        text: 'some text',
      };

      expect(hasValidPendingIds(response)).toBe(false);
    });

    it('should return false for empty pendingIngredientIds without fallback', () => {
      const response = {
        pendingIngredientIds: [],
      };

      expect(hasValidPendingIds(response)).toBe(false);
    });
  });
});
