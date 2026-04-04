import { describe, expect, it } from 'vitest';
import {
  flattenCollection,
  flattenResource,
  flattenSingle,
  isJsonApiResponse,
} from '../../src/api/json-api.js';

describe('json-api', () => {
  describe('flattenResource', () => {
    it('merges id with attributes', () => {
      const result = flattenResource<{ id: string; label: string }>({
        attributes: { label: 'Test' },
        id: '123',
        type: 'brand',
      });

      expect(result.id).toBe('123');
      expect(result.label).toBe('Test');
    });

    it('handles empty attributes', () => {
      const result = flattenResource<{ id: string }>({
        attributes: {},
        id: '123',
        type: 'brand',
      });

      expect(result.id).toBe('123');
    });
  });

  describe('flattenCollection', () => {
    it('flattens array of resources', () => {
      const result = flattenCollection<{ id: string; label: string }>({
        data: [
          { attributes: { label: 'A' }, id: '1', type: 'brand' },
          { attributes: { label: 'B' }, id: '2', type: 'brand' },
        ],
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', label: 'A' });
      expect(result[1]).toEqual({ id: '2', label: 'B' });
    });

    it('returns empty array for empty data', () => {
      const result = flattenCollection({ data: [] });

      expect(result).toEqual([]);
    });

    it('returns empty array for missing data', () => {
      const result = flattenCollection({ data: undefined as never });

      expect(result).toEqual([]);
    });
  });

  describe('flattenSingle', () => {
    it('flattens a single resource', () => {
      const result = flattenSingle<{ id: string; label: string; status: string }>({
        data: {
          attributes: { label: 'My Brand', status: 'active' },
          id: 'brand-1',
          type: 'brand',
        },
      });

      expect(result).toEqual({ id: 'brand-1', label: 'My Brand', status: 'active' });
    });
  });

  describe('isJsonApiResponse', () => {
    it('detects JSON:API collection', () => {
      expect(
        isJsonApiResponse({
          data: [{ attributes: { label: 'A' }, id: '1', type: 'brand' }],
        })
      ).toBe(true);
    });

    it('detects JSON:API single resource', () => {
      expect(
        isJsonApiResponse({
          data: { attributes: { label: 'A' }, id: '1', type: 'brand' },
        })
      ).toBe(true);
    });

    it('detects empty collection as JSON:API', () => {
      expect(isJsonApiResponse({ data: [] })).toBe(true);
    });

    it('rejects plain object response', () => {
      expect(isJsonApiResponse({ data: { id: '1', name: 'test' } })).toBe(false);
    });

    it('rejects response without data', () => {
      expect(isJsonApiResponse({})).toBe(false);
    });
  });
});
