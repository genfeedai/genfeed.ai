import {
  createEntityAttributes,
  getSerializer,
  type ISerializerConfig,
  type ISerializerOptions,
} from '@helpers/serializer.helper';
import { Serializer } from 'ts-jsonapi';

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
            ref: '_id',
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
            ref: '_id',
            type: 'user',
          },
        },
        type: 'publication',
      };

      const serializer = getSerializer(config);
      const testData = {
        author: {
          _id: 'user-123',
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
