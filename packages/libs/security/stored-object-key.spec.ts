import { describe, expect, it } from 'vitest';
import { assertStoredObjectKey } from './stored-object-key';

const invalid = (message: string) => new Error(message);
describe('canonical stored object key', () => {
  it('preserves literal reserved characters and leading/trailing spaces', () => {
    const key = 'ingredients/images/ space ?#%2F.png ';
    expect(assertStoredObjectKey(key, invalid)).toBe(key);
  });
  it.each([
    '',
    '/private',
    'https://example.test/object',
    '../private',
    'nested/../private',
    'nested//private',
    'nested\\private',
    'nested/\u0000private',
  ])('rejects structural traversal and non-object identity %s', (key) => {
    expect(() => assertStoredObjectKey(key, invalid)).toThrow();
  });
});
