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
  it('returns correct type for the rendered core imageGen image output', () => {
    expect(getHandleType('imageGen', 'image', 'source')).toBe('image');
    expect(getHandleType('imageGen', 'imageUrl', 'source')).toBeNull();
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
    expect(getHandleType('imageGen', 'nonexistent', 'source')).toBeNull();
  });

  it('returns null when handle id is null', () => {
    expect(getHandleType('imageGen', null, 'source')).toBeNull();
  });

  it('returns text type for llm node text output', () => {
    expect(getHandleType('llm', 'text', 'source')).toBe('text');
  });

  it('resolves the actual action handles instead of generic action ports', () => {
    const data = { actionId: 'remotion.composition.status' };
    expect(getHandleType('genfeedAction', 'projectId', 'target', data)).toBe(
      'text',
    );
    expect(
      getHandleType('genfeedAction', 'progress', 'source', data),
    ).toBeNull();
    expect(getHandleType('genfeedAction', 'input', 'target', data)).toBeNull();
    expect(getHandleType('genfeedAction', 'output', 'source', data)).toBeNull();
  });

  it('resolves registered trigger handles and rejects unknown actions', () => {
    expect(getHandleType('keywordTrigger', 'text', 'source')).toBe('text');
    expect(
      getHandleType('genfeedAction', 'input', 'target', {
        actionId: 'missing',
      }),
    ).toBeNull();
  });

  it('resolves additional visible model inputs while preserving action field types', () => {
    const data = {
      actionId: 'remotion.composition.status',
      selectedModel: {
        inputSchema: {
          properties: {
            image: { type: 'string' },
            projectId: { type: 'number' },
            arbitraryField: { type: 'string' },
          },
        },
      },
    };
    expect(getHandleType('genfeedAction', 'image', 'target', data)).toBe(
      'image',
    );
    expect(getHandleType('genfeedAction', 'projectId', 'target', data)).toBe(
      'text',
    );
    expect(
      getHandleType('genfeedAction', 'arbitraryField', 'target', data),
    ).toBeNull();
  });
});
