import { describe, expect, it } from 'vitest';

import {
  assertBoundedInteger,
  assertBoundedNumber,
  assertSafeArgValue,
  MAX_ARG_VALUE_LENGTH,
  SAFE_ARG_VALUE_PATTERN,
} from './arg-security';

const createError = (message: string): Error => new Error(message);

describe('assertSafeArgValue', () => {
  // The whole point of the guard: `spawn` passes argv verbatim, so a value
  // starting with `-` is read by the child as a flag rather than as the value
  // of the flag that preceded it.

  it.each([
    ['an empty string', ''],
    ['a path separator', 'a/b'],
    ['a parent traversal', '../evil'],
    ['a shell substitution', '$(whoami)'],
    ['a backtick', 'a`b`'],
    ['a semicolon', 'a;b'],
    ['a newline', 'a\nb'],
    ['a null byte', 'a\u0000b'],
    ['a leading space', ' persona'],
    ['a non-ASCII character', 'personaé'],
  ])('rejects %s', (_label, value) => {
    expect(() => assertSafeArgValue(value, 'triggerWord', createError)).toThrow(
      Error,
    );
  });

  it('rejects a value longer than the maximum', () => {
    const tooLong = 'a'.repeat(MAX_ARG_VALUE_LENGTH + 1);

    expect(() =>
      assertSafeArgValue(tooLong, 'triggerWord', createError),
    ).toThrow(/at most/);
  });

  it('accepts a value exactly at the maximum', () => {
    const atLimit = 'a'.repeat(MAX_ARG_VALUE_LENGTH);

    expect(assertSafeArgValue(atLimit, 'triggerWord', createError)).toBe(
      atLimit,
    );
  });

  it('anchors the pattern at both ends', () => {
    expect(SAFE_ARG_VALUE_PATTERN.source.startsWith('^')).toBe(true);
    expect(SAFE_ARG_VALUE_PATTERN.source.endsWith('$')).toBe(true);
  });
});

const BOUNDS = { max: 100, min: 1 };

describe('assertBoundedNumber', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the non-finite %s',
    (value) => {
      expect(() =>
        assertBoundedNumber(value, 'steps', BOUNDS, createError),
      ).toThrow(Error);
    },
  );

  // A field typed `number` in TypeScript is still whatever JSON arrived at
  // runtime. Coercing would accept these; rejecting is the only safe read.
});

describe('assertBoundedInteger', () => {
  it.each([1, 50, 100])('accepts %s', (value) => {
    expect(assertBoundedInteger(value, 'steps', BOUNDS, createError)).toBe(
      value,
    );
  });

  it.each([1.5, 99.9, Number.NaN, '50'])(
    'rejects the non-integer %s',
    (value) => {
      expect(() =>
        assertBoundedInteger(value, 'steps', BOUNDS, createError),
      ).toThrow(/must be an integer/);
    },
  );

  it('uses the error factory it is given', () => {
    class DomainError extends Error {}

    expect(() =>
      assertBoundedInteger(
        0,
        'steps',
        BOUNDS,
        (message) => new DomainError(message),
      ),
    ).toThrow(DomainError);
  });
});
