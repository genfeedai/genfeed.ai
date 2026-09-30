import { describe, expect, it } from 'vitest';

import {
  getDeserializer,
  isDeserializerRuntime,
  type JsonApiDocument,
} from './deserializer.helper';

type DeserializedAuthor = { id: string; name: string };
type DeserializedPost = { author: DeserializedAuthor };

describe('getDeserializer', () => {
  it('indexes included resources once across collection roots', () => {
    let identityReads = 0;
    const included = Array.from({ length: 100 }, (_, index) => ({
      get id() {
        identityReads += 1;
        return String(index);
      },
      type: 'people',
      attributes: { name: `Person ${index}` },
    }));
    const doc: JsonApiDocument = {
      data: Array.from({ length: 30 }, (_, index) => ({
        id: String(index),
        type: 'posts',
        relationships: { author: { data: { id: '99', type: 'people' } } },
      })),
      included,
    };
    const result = getDeserializer<DeserializedPost[]>(doc);
    expect(result).toHaveLength(30);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ author: { id: '99', name: 'Person 99' } }),
      ]),
    );
    expect(identityReads).toBeLessThan(400);
  });

  it('preserves first included match and per-root directed-edge cycle handling', () => {
    const a = {
      id: 'a',
      type: 'nodes',
      attributes: { label: 'first' },
      relationships: { next: { data: { id: 'b', type: 'nodes' } } },
    };
    const b = {
      id: 'b',
      type: 'nodes',
      relationships: { next: { data: { id: 'a', type: 'nodes' } } },
    };
    const doc: JsonApiDocument = {
      data: [a, a],
      included: [a, b, { ...a, attributes: { label: 'duplicate' } }],
    };
    const expected = {
      id: 'a',
      label: 'first',
      next: { id: 'b', next: { id: 'a', label: 'first' } },
    };
    expect(getDeserializer(doc)).toEqual([expected, expected]);
  });

  it('keeps resource types and relation names distinct when identifiers contain separators', () => {
    const doc: JsonApiDocument = {
      data: {
        id: 'root',
        type: 'roots',
        relationships: {
          first: { data: { id: 'b:c', type: 'a' } },
          second: { data: { id: 'c', type: 'a:b' } },
          repeated: {
            data: [
              { id: 'b:c', type: 'a' },
              { id: 'b:c', type: 'a' },
            ],
          },
        },
      },
      included: [
        { id: 'b:c', type: 'a' },
        { id: 'c', type: 'a:b' },
      ],
    };
    expect(getDeserializer(doc)).toEqual({
      id: 'root',
      first: { id: 'b:c' },
      second: { id: 'c' },
      repeated: [{ id: 'b:c' }, null],
    });
  });

  it('deserializes a single resource', () => {
    const doc: JsonApiDocument = {
      data: {
        attributes: { 'is-active': true, name: 'Test' },
        id: '1',
        type: 'items',
      },
    };

    const result = getDeserializer<Record<string, unknown>>(doc);
    expect(result).toEqual({
      id: '1',
      isActive: true,
      name: 'Test',
    });
  });

  it('deserializes a collection', () => {
    const doc: JsonApiDocument = {
      data: [
        { attributes: { title: 'A' }, id: '1', type: 'posts' },
        { attributes: { title: 'B' }, id: '2', type: 'posts' },
      ],
    };

    const result = getDeserializer<Array<Record<string, unknown>>>(doc);
    expect(result).toHaveLength(2);
    expect((result as Array<Record<string, unknown>>)[0]).toEqual({
      id: '1',
      title: 'A',
    });
  });

  it('returns runtime when document has no data', () => {
    const result = getDeserializer(undefined);
    expect(isDeserializerRuntime(result)).toBe(true);
  });

  it('returns runtime for empty document', () => {
    const result = getDeserializer({});
    expect(isDeserializerRuntime(result)).toBe(true);
  });

  it('camelCases attribute keys by default', () => {
    const doc: JsonApiDocument = {
      data: {
        attributes: { 'first-name': 'John', 'last-name': 'Doe' },
        id: '1',
        type: 'users',
      },
    };

    const result = getDeserializer<Record<string, unknown>>(doc);
    expect(result).toHaveProperty('firstName', 'John');
    expect(result).toHaveProperty('lastName', 'Doe');
  });

  it('handles relationships with included resources', () => {
    const doc: JsonApiDocument = {
      data: {
        attributes: { title: 'Post' },
        id: '1',
        relationships: {
          author: { data: { id: '10', type: 'users' } },
        },
        type: 'posts',
      },
      included: [
        {
          attributes: { name: 'Alice' },
          id: '10',
          type: 'users',
        },
      ],
    };

    const result = getDeserializer<Record<string, unknown>>(doc);
    expect(result).toHaveProperty('title', 'Post');
    expect(result).toHaveProperty('author');
    expect((result as Record<string, unknown>).author).toEqual({
      id: '10',
      name: 'Alice',
    });
  });

  it('handles null relationships', () => {
    const doc: JsonApiDocument = {
      data: {
        attributes: { title: 'Post' },
        id: '1',
        relationships: {
          author: { data: null },
        },
        type: 'posts',
      },
    };

    const result = getDeserializer<Record<string, unknown>>(doc);
    expect(result).toHaveProperty('author', null);
  });

  it('handles array relationships', () => {
    const doc: JsonApiDocument = {
      data: {
        attributes: { title: 'Post' },
        id: '1',
        relationships: {
          tags: {
            data: [
              { id: 't1', type: 'tags' },
              { id: 't2', type: 'tags' },
            ],
          },
        },
        type: 'posts',
      },
      included: [
        { attributes: { label: 'A' }, id: 't1', type: 'tags' },
        { attributes: { label: 'B' }, id: 't2', type: 'tags' },
      ],
    };

    const result = getDeserializer<Record<string, unknown>>(doc);
    const tags = (result as Record<string, unknown>).tags as Array<
      Record<string, unknown>
    >;
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({ id: 't1', label: 'A' });
  });

  it('infers relationship options when no included array', () => {
    const doc: JsonApiDocument = {
      data: {
        attributes: { title: 'Post' },
        id: '1',
        relationships: {
          author: { data: { id: '10', type: 'users' } },
        },
        type: 'posts',
      },
    };

    const result = getDeserializer<Record<string, unknown>>(doc);
    expect(result).toHaveProperty('author');
    expect((result as Record<string, unknown>).author).toEqual({ id: '10' });
  });

  it('handles nested object attributes', () => {
    const doc: JsonApiDocument = {
      data: {
        attributes: {
          metadata: { 'created-by': 'admin', 'updated-by': 'system' },
        },
        id: '1',
        type: 'items',
      },
    };

    const result = getDeserializer<Record<string, unknown>>(doc);
    expect(
      (result as Record<string, Record<string, unknown>>).metadata,
    ).toEqual({
      createdBy: 'admin',
      updatedBy: 'system',
    });
  });
});

describe('isDeserializerRuntime', () => {
  it('returns true for objects with deserialize method', () => {
    expect(isDeserializerRuntime({ deserialize: () => {} })).toBe(true);
  });

  it('returns false for plain objects', () => {
    expect(isDeserializerRuntime({ foo: 'bar' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDeserializerRuntime(null)).toBe(false);
  });
});

describe('Deserializer Helper', () => {
  describe('getDeserializer', () => {
    test('should deserialize data with basic options', () => {
      const data = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', '123');
      expect(result).toHaveProperty('name', 'John Doe');
      expect(result).toHaveProperty('email', 'john@example.com');
    });

    test('should deserialize simple data structure', () => {
      const data = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', '123');
      expect(result).toHaveProperty('name', 'John Doe');
      expect(result).toHaveProperty('email', 'john@example.com');
    });

    test('should handle data with relationships', () => {
      const data = {
        data: {
          attributes: {
            content: 'Test content',
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: {
                id: 'user-123',
                type: 'user',
              },
            },
          },
          type: 'publication',
        },
        included: [
          {
            attributes: {
              email: 'john@example.com',
              name: 'John Doe',
            },
            id: 'user-123',
            type: 'user',
          },
        ],
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', 'pub-123');
      expect(result).toHaveProperty('title', 'Test Publication');
      expect(result).toHaveProperty('content', 'Test content');
      expect(result).toHaveProperty('author');
      expect(result.author).toHaveProperty('id', 'user-123');
      expect(result.author).toHaveProperty('name', 'John Doe');
      expect(result.author).toHaveProperty('email', 'john@example.com');
    });

    test('should handle data without relationships', () => {
      const data = {
        data: {
          attributes: {
            email: 'john@example.com',
            name: 'John Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', '123');
      expect(result).toHaveProperty('name', 'John Doe');
      expect(result).toHaveProperty('email', 'john@example.com');
    });

    test('should handle multiple relationships', () => {
      const data = {
        data: {
          attributes: {
            content: 'Test content',
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: {
                id: 'user-123',
                type: 'user',
              },
            },
            organization: {
              data: {
                id: 'org-123',
                type: 'organization',
              },
            },
          },
          type: 'publication',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('author');
      expect(result.author).toHaveProperty('id', 'user-123');
      expect(result).toHaveProperty('organization');
      expect(result.organization).toHaveProperty('id', 'org-123');
    });

    test('should handle null relationships', () => {
      const data = {
        data: {
          attributes: {
            content: 'Test content',
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: null,
            },
          },
          type: 'publication',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('author', null);
    });

    test('should handle array relationships', () => {
      const data = {
        data: {
          attributes: {
            name: 'Test Organization',
          },
          id: 'org-123',
          relationships: {
            members: {
              data: [
                { id: 'user-1', type: 'user' },
                { id: 'user-2', type: 'user' },
              ],
            },
          },
          type: 'organization',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('members');
      expect(Array.isArray(result.members)).toBe(true);
      expect(result.members).toHaveLength(2);
      expect(result.members[0]).toHaveProperty('id', 'user-1');
      expect(result.members[1]).toHaveProperty('id', 'user-2');
    });

    test('should return deserializer runtime when no data provided', () => {
      const data = {};

      const result = getDeserializer(data);

      // When no primary data, returns the deserializer runtime object
      expect(result).toBeDefined();
      expect(isDeserializerRuntime(result)).toBe(true);
    });

    test('should handle data without attributes', () => {
      const data = {
        data: {
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('id', '123');
    });

    test('should preserve camelCase key transformation', () => {
      const data = {
        data: {
          attributes: {
            email_address: 'john@example.com',
            first_name: 'John',
            last_name: 'Doe',
          },
          id: '123',
          type: 'user',
        },
      };

      const result = getDeserializer(data);

      // The deserializer should convert snake_case to camelCase
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('emailAddress');
    });

    test('should handle complex nested relationships', () => {
      const data = {
        data: {
          attributes: {
            title: 'Test Publication',
          },
          id: 'pub-123',
          relationships: {
            author: {
              data: {
                id: 'user-123',
                type: 'user',
              },
            },
            ingredients: {
              data: [
                {
                  id: 'ing-1',
                  type: 'ingredient',
                },
                {
                  id: 'ing-2',
                  type: 'ingredient',
                },
              ],
            },
          },
          type: 'publication',
        },
        included: [
          {
            attributes: {
              name: 'John Doe',
            },
            id: 'user-123',
            type: 'user',
          },
          {
            attributes: {
              type: 'video',
              url: 'https://example.com/video1.mp4',
            },
            id: 'ing-1',
            type: 'ingredient',
          },
          {
            attributes: {
              type: 'image',
              url: 'https://example.com/image1.jpg',
            },
            id: 'ing-2',
            type: 'ingredient',
          },
        ],
      };

      const result = getDeserializer(data);

      expect(result).toHaveProperty('author');
      expect(result.author).toHaveProperty('id', 'user-123');
      expect(result).toHaveProperty('ingredients');
      expect(Array.isArray(result.ingredients)).toBe(true);
      expect(result.ingredients).toHaveLength(2);
      expect(result.ingredients[0]).toHaveProperty('id', 'ing-1');
      expect(result.ingredients[1]).toHaveProperty('id', 'ing-2');
    });
  });
});
