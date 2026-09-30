import { Serializer } from 'ts-jsonapi';
import { describe, expect, it } from 'vitest';
import {
  createEntityAttributes,
  getSerializer,
  type ISerializerConfig,
  type ISerializerOptions,
} from './serializer.helper';

describe('createEntityAttributes', () => {
  it('adds standard entity fields to custom attributes', () => {
    const attrs = createEntityAttributes(['name', 'email']);
    expect(attrs).toContain('name');
    expect(attrs).toContain('email');
    expect(attrs).toContain('createdAt');
    expect(attrs).toContain('updatedAt');
    expect(attrs).toContain('isDeleted');
  });

  it('deduplicates when standard fields are already included', () => {
    const attrs = createEntityAttributes([
      'name',
      'createdAt',
      'updatedAt',
      'isDeleted',
    ]);
    const createdAtCount = attrs.filter((a) => a === 'createdAt').length;
    expect(createdAtCount).toBe(1);
  });

  it('returns at least 3 elements for empty input', () => {
    const attrs = createEntityAttributes([]);
    expect(attrs).toEqual(['createdAt', 'updatedAt', 'isDeleted']);
  });
});

describe('getSerializer', () => {
  const config = {
    attributes: ['name', 'email'],
    type: 'users',
  };

  it('returns a serializer object with serialize method', () => {
    const serializer = getSerializer(config);
    expect(serializer).toHaveProperty('serialize');
    expect(typeof serializer.serialize).toBe('function');
  });

  it('serializes a single resource', () => {
    const serializer = getSerializer(config, 'default');
    const result = serializer.serialize({
      email: 'test@example.com',
      id: '1',
      name: 'Test',
    }) as { data: Record<string, unknown> };

    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('type', 'users');
  });

  it('uses id as identifier in api mode', () => {
    const serializer = getSerializer(config, 'api');
    const result = serializer.serialize({
      email: 'test@example.com',
      id: 'abc123',
      name: 'Test',
    }) as { data: { id: string } };

    expect(result.data.id).toBe('abc123');
  });

  it('serializes a collection', () => {
    const serializer = getSerializer(config, 'default');
    const result = serializer.serialize([
      { email: 'a@test.com', id: '1', name: 'A' },
      { email: 'b@test.com', id: '2', name: 'B' },
    ]) as { data: Array<Record<string, unknown>> };

    expect(result.data).toHaveLength(2);
  });

  it('accepts custom options that override defaults', () => {
    const serializer = getSerializer(config, 'default', {
      pluralizeType: true,
    });
    expect(serializer).toHaveProperty('serialize');
  });
});

describe('Serializer Helper', () => {
  describe('createEntityAttributes', () => {
    test('should add audit and soft delete attributes to custom attributes', () => {
      const customAttributes = ['name', 'email'];
      const result = createEntityAttributes(customAttributes);

      expect(result).toEqual([
        'name',
        'email',
        'createdAt',
        'updatedAt',
        'isDeleted',
      ]);
    });

    test('should handle empty custom attributes', () => {
      const result = createEntityAttributes([]);

      expect(result).toEqual(['createdAt', 'updatedAt', 'isDeleted']);
    });

    test('should handle single custom attribute', () => {
      const result = createEntityAttributes(['id']);

      expect(result).toEqual(['id', 'createdAt', 'updatedAt', 'isDeleted']);
    });

    test('should preserve order of custom attributes', () => {
      const result = createEntityAttributes(['a', 'b', 'c']);

      expect(result).toEqual([
        'a',
        'b',
        'c',
        'createdAt',
        'updatedAt',
        'isDeleted',
      ]);
    });
  });

  describe('getSerializer', () => {
    test('should create serializer with default mode', () => {
      const config: ISerializerConfig = {
        attributes: ['id', 'name', 'email'],
        type: 'user',
      };

      const serializer = getSerializer(config);

      expect(serializer).toBeInstanceOf(Serializer);
    });

    test('should create serializer with API mode', () => {
      const config: ISerializerConfig = {
        attributes: ['id', 'name', 'email'],
        type: 'user',
      };

      const serializer = getSerializer(config, 'api');

      expect(serializer).toBeInstanceOf(Serializer);
    });

    test('should create serializer with frontend mode', () => {
      const config: ISerializerConfig = {
        attributes: ['id', 'name', 'email'],
        type: 'user',
      };

      const serializer = getSerializer(config, 'frontend');

      expect(serializer).toBeInstanceOf(Serializer);
    });

    test('should create serializer with custom options', () => {
      const config: ISerializerConfig = {
        attributes: ['id', 'name', 'email'],
        type: 'user',
      };

      const customOptions: ISerializerOptions = {
        id: 'customId',
        nullIfMissing: false,
      };

      const serializer = getSerializer(config, 'default', customOptions);

      expect(serializer).toBeInstanceOf(Serializer);
    });

    test('should handle serializer with relationships', () => {
      const config: ISerializerConfig = {
        attributes: ['title', 'content'],
        relationships: {
          author: {
            attributes: ['name'],
            ref: 'id',
            type: 'user',
          },
        },
        type: 'publication',
      };

      const serializer = getSerializer(config);

      expect(serializer).toBeInstanceOf(Serializer);
    });
  });

  describe('Serializer Integration Tests', () => {
    test('should serialize data correctly with default configuration', () => {
      const config: ISerializerConfig = {
        attributes: ['id', 'name', 'email'],
        type: 'user',
      };

      const serializer = getSerializer(config);
      const testData = {
        createdAt: '2023-01-01T00:00:00Z',
        email: 'john@example.com',
        id: '123',
        name: 'John Doe',
        updatedAt: '2023-01-01T00:00:00Z',
      };

      const result = serializer.serialize(testData);

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('type', 'user');
      expect(result.data).toHaveProperty('id', '123');
      expect(result.data).toHaveProperty('attributes');
      expect(result.data.attributes).toHaveProperty('name', 'John Doe');
      expect(result.data.attributes).toHaveProperty(
        'email',
        'john@example.com',
      );
    });

    test('should serialize data with relationships', () => {
      const config: ISerializerConfig = {
        attributes: ['title', 'content'],
        relationships: {
          author: {
            attributes: ['name', 'email'],
            ref: 'id',
            type: 'user',
          },
        },
        type: 'publication',
      };

      const serializer = getSerializer(config);
      const testData = {
        author: {
          id: 'user-123',
          email: 'john@example.com',
          name: 'John Doe',
        },
        content: 'Test content',
        id: 'pub-123',
        title: 'Test Publication',
      };

      const result = serializer.serialize(testData);

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('type', 'publication');
      expect(result.data).toHaveProperty('id', 'pub-123');
      expect(result.data).toHaveProperty('attributes');
    });

    test('should handle null values correctly', () => {
      const config: ISerializerConfig = {
        attributes: ['id', 'name', 'email', 'phone'],
        type: 'user',
      };

      const serializer = getSerializer(config);
      const testData = {
        email: 'john@example.com',
        id: '123',
        name: 'John Doe',
        phone: null,
      };

      const result = serializer.serialize(testData);

      expect(result.data.attributes).toHaveProperty('name', 'John Doe');
      expect(result.data.attributes).toHaveProperty(
        'email',
        'john@example.com',
      );
    });

    test('should serialize multiple times without data leakage', () => {
      const config: ISerializerConfig = {
        attributes: ['id', 'label'],
        type: 'brand',
      };

      const serializer = getSerializer(config);

      const firstPass = {
        id: 'brand-1',
        label: 'Original',
      };

      const secondPass = {
        id: 'brand-2',
        label: 'Updated',
      };

      const firstResult = serializer.serialize(firstPass);
      expect(firstResult.data.attributes?.label).toBe('Original');
      expect(firstResult.data.id).toBe('brand-1');

      const secondResult = serializer.serialize(secondPass);
      expect(secondResult.data.attributes?.label).toBe('Updated');
      expect(secondResult.data.id).toBe('brand-2');
    });
  });
});
