import { describe, expect, it } from 'vitest';

import {
  getDeserializer,
  isDeserializerRuntime,
  type JsonApiDocument,
} from './deserializer.helper';

describe('getDeserializer', () => {
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
