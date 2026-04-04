import { describe, expect, it } from 'vitest';

import { createEntityAttributes, getSerializer } from './serializer.helper';

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

  it('uses _id as identifier in api mode', () => {
    const serializer = getSerializer(config, 'api');
    const result = serializer.serialize({
      _id: 'abc123',
      email: 'test@example.com',
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
