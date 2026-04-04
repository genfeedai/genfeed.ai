import { HashUtil } from '@api/shared/utils/hash/hash.util';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('HashUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('is defined', () => {
    expect(HashUtil).toBeDefined();
    expect(HashUtil.hash).toBeDefined();
  });

  it('returns SHA-256 hash for provided value', () => {
    const hash = HashUtil.hash('genfeed');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(
      'f9e79065f4bd28528ba1e30300c49cc561f9859617d4a4e7b9edc8d38e161a71',
    );
  });

  it('returns original value when empty input provided', () => {
    expect(HashUtil.hash('')).toBe('');
    expect(HashUtil.hash(undefined as unknown as string)).toBeUndefined();
  });

  it('returns same hash for same input (deterministic)', () => {
    const value = 'consistent-input';
    expect(HashUtil.hash(value)).toBe(HashUtil.hash(value));
  });

  it('returns different hashes for different inputs', () => {
    expect(HashUtil.hash('value1')).not.toBe(HashUtil.hash('value2'));
  });

  it('returns a 64-character hex string for any non-empty string', () => {
    const inputs = ['hello', 'world', '12345', 'special-chars!@#'];
    for (const input of inputs) {
      const hash = HashUtil.hash(input);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('hash of "hello" is known SHA-256 value', () => {
    // SHA-256 of "hello" is well-known
    const hash = HashUtil.hash('hello');
    expect(hash).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('handles whitespace-only strings', () => {
    const hash = HashUtil.hash('   ');
    expect(hash).toHaveLength(64);
  });

  it('is case-sensitive', () => {
    expect(HashUtil.hash('Hello')).not.toBe(HashUtil.hash('hello'));
  });
});
