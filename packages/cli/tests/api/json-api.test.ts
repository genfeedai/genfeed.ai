import { describe, expect, it } from 'vitest';
import { extractPagination, flattenCollection, flattenSingle } from '../../src/api/json-api';

describe('json-api', () => {
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

  describe('extractPagination', () => {
    it('reads the top-level pagination block', () => {
      const pagination = extractPagination({
        data: [],
        links: { pagination: { limit: 100, page: 2, pages: 5, total: 420 } },
      } as never);

      expect(pagination).toEqual({ limit: 100, page: 2, pages: 5, total: 420 });
    });

    it('returns undefined when no links are present', () => {
      expect(extractPagination({ data: [] })).toBeUndefined();
    });

    it('returns undefined when the pagination block is malformed', () => {
      expect(
        extractPagination({
          data: [],
          links: { pagination: { limit: 100 } },
        } as never)
      ).toBeUndefined();
    });
  });
});
