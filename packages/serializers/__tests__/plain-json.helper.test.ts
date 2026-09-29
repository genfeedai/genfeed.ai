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

  it('passes primitives through intact', () => {
    expect(toPlainJson(42)).toBe(42);
    expect(toPlainJson('text')).toBe('text');
    expect(toPlainJson(true)).toBe(true);
  });
});
