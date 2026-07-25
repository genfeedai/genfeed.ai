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
  it.each([
    'persona',
    'Persona 42',
    'my_lora-v2',
    'a.b.c',
    'X',
  ])('accepts %s', (value) => {
    expect(assertSafeArgValue(value, 'triggerWord', createError)).toBe(value);
  });

  // The whole point of the guard: `spawn` passes argv verbatim, so a value
  // starting with `-` is read by the child as a flag rather than as the value
  // of the flag that preceded it.
  it.each([
    '--config_file=/etc/shadow',
    '-o',
    '--output_dir',
    '-',
    '--',
  ])('rejects the argument-injection payload %s', (value) => {
    expect(() => assertSafeArgValue(value, 'triggerWord', createError)).toThrow(
      /may not start with/,
    );
  });

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

  it.each([
    null,
    undefined,
    42,
    {},
    [],
  ])('rejects the non-string %s', (value) => {
    expect(() =>
      assertSafeArgValue(value as unknown as string, 'name', createError),
    ).toThrow(Error);
  });

  it('anchors the pattern at both ends', () => {
    expect(SAFE_ARG_VALUE_PATTERN.source.startsWith('^')).toBe(true);
    expect(SAFE_ARG_VALUE_PATTERN.source.endsWith('$')).toBe(true);
  });
});

const BOUNDS = { max: 100, min: 1 };

describe('assertBoundedNumber', () => {
  it.each([1, 50, 100, 1.5])('accepts %s', (value) => {
    expect(assertBoundedNumber(value, 'steps', BOUNDS, createError)).toBe(
      value,
    );
  });

  it.each([
    0,
    -1,
    101,
    Number.MAX_SAFE_INTEGER,
  ])('rejects out-of-range %s', (value) => {
    expect(() =>
      assertBoundedNumber(value, 'steps', BOUNDS, createError),
    ).toThrow(/between 1 and 100/);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects the non-finite %s', (value) => {
    expect(() =>
      assertBoundedNumber(value, 'steps', BOUNDS, createError),
    ).toThrow(Error);
  });

  // A field typed `number` in TypeScript is still whatever JSON arrived at
  // runtime. Coercing would accept these; rejecting is the only safe read.
  it.each([
    '50',
    '1e999',
    '',
    ' ',
    '0x10',
    'NaN',
  ])('rejects the string %s instead of coercing it', (value) => {
    expect(() =>
      assertBoundedNumber(value, 'steps', BOUNDS, createError),
    ).toThrow(Error);
  });

  it.each([
    null,
    undefined,
    {},
    [],
    true,
  ])('rejects the non-number %s', (value) => {
    expect(() =>
      assertBoundedNumber(value, 'steps', BOUNDS, createError),
    ).toThrow(Error);
  });
});

describe('assertBoundedInteger', () => {
  it.each([1, 50, 100])('accepts %s', (value) => {
    expect(assertBoundedInteger(value, 'steps', BOUNDS, createError)).toBe(
      value,
    );
  });

  it.each([
    1.5,
    99.9,
    Number.NaN,
    '50',
  ])('rejects the non-integer %s', (value) => {
    expect(() =>
      assertBoundedInteger(value, 'steps', BOUNDS, createError),
    ).toThrow(/must be an integer/);
  });

  it.each([0, 101])('rejects out-of-range %s', (value) => {
    expect(() =>
      assertBoundedInteger(value, 'steps', BOUNDS, createError),
    ).toThrow(/between 1 and 100/);
  });

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
