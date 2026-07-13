import { describe, expect, it } from 'vitest';

import { generateId, getHandleType } from './nodeHelpers';

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns 8 characters', () => {
    expect(generateId()).toHaveLength(8);
  });

  it('two calls return different values', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });

  it('only contains URL-safe characters', () => {
    const id = generateId();
    // nanoid default alphabet: A-Za-z0-9_-
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('getHandleType', () => {
  it('returns correct type for known source handle (imageInput → image)', () => {
    expect(getHandleType('imageInput', 'image', 'source')).toBe('image');
  });

  it('returns correct type for known target handle (imageGen → prompt)', () => {
    expect(getHandleType('imageGen', 'prompt', 'target')).toBe('text');
  });

  it('returns null for unknown node type', () => {
    expect(
      getHandleType('nonExistentNode' as never, 'image', 'source'),
    ).toBeNull();
  });

  it('returns null for known node type with unknown handle id', () => {
    expect(getHandleType('imageInput', 'nonexistent', 'source')).toBeNull();
  });

  it('returns null when handle id is null', () => {
    expect(getHandleType('imageInput', null, 'source')).toBeNull();
  });

  it('returns text type for prompt node text output', () => {
    expect(getHandleType('prompt', 'text', 'source')).toBe('text');
  });
});
