import { describe, expect, it } from 'vitest';
import { toPrismaJson } from '../src/to-prisma-json';

describe('toPrismaJson', () => {
  it('maps undefined to JSON null', () => {
    expect(toPrismaJson(undefined)).toBeNull();
  });

  it('maps null to JSON null', () => {
    expect(toPrismaJson(null)).toBeNull();
  });

  it('strips undefined keys via stringify', () => {
    expect(
      toPrismaJson({
        keep: 'yes',
        skip: undefined,
        nested: { keep: 1, skip: undefined },
      }),
    ).toEqual({
      keep: 'yes',
      nested: { keep: 1 },
    });
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

  it('serializes Date values to ISO strings', () => {
    const at = new Date('2026-08-19T12:00:00.000Z');
    expect(toPrismaJson({ lastClickAt: at })).toEqual({
      lastClickAt: '2026-08-19T12:00:00.000Z',
    });
  });
});
