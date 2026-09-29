import {
  hasValidPendingIds,
  resolvePendingIds,
} from '@utils/network/generation.util';
import { describe, expect, it } from 'vitest';

describe('generation.util', () => {
  describe('resolvePendingIds', () => {
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
