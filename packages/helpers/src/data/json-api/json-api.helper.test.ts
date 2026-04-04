import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the deserializer helper
const { mockGetDeserializer, mockIsDeserializerRuntime } = vi.hoisted(() => ({
  mockGetDeserializer: vi.fn(),
  mockIsDeserializerRuntime: vi.fn(),
}));

vi.mock('../../deserializer.helper', () => ({
  getDeserializer: mockGetDeserializer,
  isDeserializerRuntime: mockIsDeserializerRuntime,
}));

import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';

describe('json-api.helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('deserializeResource', () => {
    it('should deserialize a valid resource', () => {
      const mockResource = { id: '123', name: 'Test' };
      mockGetDeserializer.mockReturnValue(mockResource);
      mockIsDeserializerRuntime.mockReturnValue(false);

      const document: JsonApiResponseDocument = {
        data: { attributes: { name: 'Test' }, id: '123', type: 'test' },
      };

      const result = deserializeResource<typeof mockResource>(document);

      expect(result).toEqual(mockResource);
      expect(mockGetDeserializer).toHaveBeenCalledWith(document);
    });

    it('should throw TypeError when deserialization returns runtime error', () => {
      mockGetDeserializer.mockReturnValue({ error: 'Invalid' });
      mockIsDeserializerRuntime.mockReturnValue(true);

      const document: JsonApiResponseDocument = {
        data: null as any,
      };

      expect(() => deserializeResource(document)).toThrow(TypeError);
      expect(() => deserializeResource(document)).toThrow(
        'Invalid JSON:API document: expected resource data',
      );
    });
  });

  describe('deserializeCollection', () => {
    it('should deserialize a valid collection', () => {
      const mockCollection = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      mockGetDeserializer.mockReturnValue(mockCollection);
      mockIsDeserializerRuntime.mockReturnValue(false);

      const document: JsonApiResponseDocument = {
        data: [
          { attributes: { name: 'Item 1' }, id: '1', type: 'test' },
          { attributes: { name: 'Item 2' }, id: '2', type: 'test' },
        ],
      };

      const result =
        deserializeCollection<(typeof mockCollection)[0]>(document);

      expect(result).toEqual(mockCollection);
      expect(result).toHaveLength(2);
    });

    it('should throw TypeError when deserialization returns runtime error', () => {
      mockGetDeserializer.mockReturnValue({ error: 'Invalid' });
      mockIsDeserializerRuntime.mockReturnValue(true);

      const document: JsonApiResponseDocument = {
        data: null as any,
      };

      expect(() => deserializeCollection(document)).toThrow(TypeError);
      expect(() => deserializeCollection(document)).toThrow(
        'Invalid JSON:API document: expected collection data',
      );
    });

    it('should throw TypeError when result is not an array', () => {
      const notAnArray = { id: '1', name: 'Single item' };
      mockGetDeserializer.mockReturnValue(notAnArray);
      mockIsDeserializerRuntime.mockReturnValue(false);

      const document: JsonApiResponseDocument = {
        data: { attributes: { name: 'Single' }, id: '1', type: 'test' },
      };

      expect(() => deserializeCollection(document)).toThrow(TypeError);
      expect(() => deserializeCollection(document)).toThrow(
        'Invalid JSON:API document: expected data to be an array',
      );
    });

    it('should return empty array for empty collection', () => {
      mockGetDeserializer.mockReturnValue([]);
      mockIsDeserializerRuntime.mockReturnValue(false);

      const document: JsonApiResponseDocument = {
        data: [],
      };

      const result = deserializeCollection(document);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('JsonApiResponseDocument interface', () => {
    it('should support meta property', () => {
      const document: JsonApiResponseDocument = {
        data: [],
        meta: { page: 1, total: 100 },
      };

      expect(document.meta).toEqual({ page: 1, total: 100 });
    });

    it('should support links.pagination property', () => {
      const document: JsonApiResponseDocument = {
        data: [],
        links: {
          pagination: {
            limit: 20,
            page: 1,
            total: 100,
          },
        },
      };

      expect(document.links?.pagination).toBeDefined();
      expect(document.links?.pagination?.total).toBe(100);
    });
  });
});
