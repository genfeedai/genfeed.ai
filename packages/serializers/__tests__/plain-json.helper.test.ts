import { toPlainJson } from '@serializers/helpers/plain-json.helper';
import { describe, expect, it } from 'vitest';

describe('toPlainJson', () => {
  it('returns null and undefined unchanged', () => {
    expect(toPlainJson(null)).toBeNull();
    expect(toPlainJson(undefined)).toBeUndefined();
  });

  it('deep-clones plain objects without shared references', () => {
    const input = { nested: { values: [1, 2, 3] }, title: 'Post' };
    const output = toPlainJson(input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output.nested).not.toBe(input.nested);
  });

  it('converts Date instances to ISO strings via JSON round-trip', () => {
    const input = { createdAt: new Date('2026-08-01T10:00:00.000Z') };
    const output = toPlainJson(input) as unknown as { createdAt: string };

    expect(output.createdAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('drops undefined properties and functions like JSON serialization does', () => {
    const input = {
      fn: () => 'nope',
      kept: 'yes',
      missing: undefined,
    };
    const output = toPlainJson(input) as Record<string, unknown>;

    expect(output).toEqual({ kept: 'yes' });
  });

  it('passes primitives through intact', () => {
    expect(toPlainJson(42)).toBe(42);
    expect(toPlainJson('text')).toBe('text');
    expect(toPlainJson(true)).toBe(true);
  });
});
