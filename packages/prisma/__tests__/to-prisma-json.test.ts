import { describe, expect, it } from 'vitest';
import { toPrismaJson } from '../src/to-prisma-json';

describe('toPrismaJson', () => {
  it('maps null to JSON null', () => {
    expect(toPrismaJson(null)).toBeNull();
  });

  it('preserves JSON-safe primitives, arrays, and objects', () => {
    expect(toPrismaJson('text')).toBe('text');
    expect(toPrismaJson(3)).toBe(3);
    expect(toPrismaJson(true)).toBe(true);
    expect(toPrismaJson([1, 'a', null])).toEqual([1, 'a', null]);
    expect(toPrismaJson({ nodes: [{ id: 'n1' }], edges: [] })).toEqual({
      edges: [],
      nodes: [{ id: 'n1' }],
    });
  });
});
