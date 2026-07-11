import {
  createSafeRegExp,
  SAFE_PATTERN_MAX_LENGTH,
  SAFE_SUBJECT_MAX_LENGTH,
} from '@workflow-engine/utils/safe-regex';
import { describe, expect, it } from 'vitest';

describe('createSafeRegExp', () => {
  it('returns a RegExp for a safe pattern', () => {
    const result = createSafeRegExp('\\d+');
    expect(result).toBeInstanceOf(RegExp);
  });

  it('applies flags correctly', () => {
    const result = createSafeRegExp('hello', 'i');
    expect(result).toBeInstanceOf(RegExp);
    expect(result?.flags).toContain('i');
  });

  it('returns null for an exponential pattern — canonical (a+)+b', () => {
    const result = createSafeRegExp('(a+)+b');
    expect(result).toBeNull();
  });

  it('returns null for a star-height-1 polynomial chain that defeats quantifier-counting checkers — 25x .* + Z', () => {
    // 51 chars, star-height 1, exactly 25 repetition nodes: passes safe-regex
    // style reps-limit checks but blocks the event loop for minutes when
    // executed against a few hundred non-matching characters.
    const result = createSafeRegExp(`${'.*'.repeat(25)}Z`);
    expect(result).toBeNull();
  });

  it('returns null for polynomial backtracking of degree >= 3', () => {
    const result = createSafeRegExp('.*.*.*Z');
    expect(result).toBeNull();
  });

  it('allows quadratic (degree-2) patterns — bounded by the subject cap', () => {
    // Any pattern starting with an unbounded quantifier is degree 2 (the
    // engine re-scans from each start position). Rejecting these would break
    // virtually all realistic user patterns.
    const result = createSafeRegExp('\\d+ features', 'gi');
    expect(result).toBeInstanceOf(RegExp);
  });

  it('allows many non-nested bounded quantifiers — 26x a?', () => {
    // Quantifier-counting checkers (safe-regex2 default limit 25) reject this
    // harmless pattern; real ambiguity analysis accepts it.
    const result = createSafeRegExp('a?'.repeat(26));
    expect(result).toBeInstanceOf(RegExp);
  });

  it('returns null when pattern exceeds SAFE_PATTERN_MAX_LENGTH', () => {
    const pattern = 'a'.repeat(SAFE_PATTERN_MAX_LENGTH + 1);
    const result = createSafeRegExp(pattern);
    expect(result).toBeNull();
  });

  it('returns null for syntactically invalid pattern', () => {
    const result = createSafeRegExp('[unclosed');
    expect(result).toBeNull();
  });

  it('safe regex correctly matches subjects', () => {
    const regex = createSafeRegExp('\\d+');
    expect(regex).not.toBeNull();
    expect(regex?.test('abc123')).toBe(true);
    expect(regex?.test('abc')).toBe(false);
  });

  it('returns a fresh RegExp instance per call so stateful flags never share lastIndex', () => {
    const first = createSafeRegExp('\\d+', 'g');
    const second = createSafeRegExp('\\d+', 'g');
    expect(first).toBeInstanceOf(RegExp);
    expect(second).toBeInstanceOf(RegExp);
    expect(first).not.toBe(second);
  });

  it('exports correct constant values', () => {
    expect(SAFE_PATTERN_MAX_LENGTH).toBe(200);
    expect(SAFE_SUBJECT_MAX_LENGTH).toBe(10_000);
  });

  it('rejects (a+)+b via static analysis without executing the regex engine', () => {
    // First call pays one-time analyzer initialization plus analysis; the
    // verdict is then cached. The cached rejection must be near-instant —
    // proof the guard short-circuits instead of evaluating the pattern.
    createSafeRegExp('(a+)+b');

    const start = performance.now();
    const result = createSafeRegExp('(a+)+b');
    const elapsed = performance.now() - start;

    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(10);
  });
});
