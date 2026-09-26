import { describe, expect, it } from 'vitest';
import {
  isBearerScheme,
  parseAuthorizationHeader,
} from './authorization-header';

describe('parseAuthorizationHeader', () => {
  it('parses a well-formed header into scheme and token', () => {
    expect(parseAuthorizationHeader('Bearer gf_1234567890abcdef')).toEqual({
      normalizedScheme: 'bearer',
      scheme: 'Bearer',
      token: 'gf_1234567890abcdef',
    });
  });

  it('preserves the scheme as presented and normalizes it for comparisons', () => {
    expect(parseAuthorizationHeader('ApiKey gf_1234567890abcdef')).toEqual({
      normalizedScheme: 'apikey',
      scheme: 'ApiKey',
      token: 'gf_1234567890abcdef',
    });
  });

  it('normalizes a mixed-case scheme (RFC 7235 scheme names are case-insensitive)', () => {
    expect(parseAuthorizationHeader('bEaReR gf_1234567890abcdef')).toEqual({
      normalizedScheme: 'bearer',
      scheme: 'bEaReR',
      token: 'gf_1234567890abcdef',
    });
  });

  it('tolerates surrounding whitespace around a well-formed header', () => {
    expect(parseAuthorizationHeader('  Bearer session-token  ')).toEqual({
      normalizedScheme: 'bearer',
      scheme: 'Bearer',
      token: 'session-token',
    });
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['scheme only', 'Bearer'],
    ['scheme with trailing whitespace only', 'Bearer   '],
    ['surplus fields', 'Bearer gf_1234567890abcdef extra'],
    ['multiple surplus fields', 'Bearer session-token extra more'],
  ])('returns undefined for a %s header', (_label, authHeader) => {
    expect(parseAuthorizationHeader(authHeader)).toBeUndefined();
  });
});

describe('isBearerScheme', () => {
  it.each([
    ['well-formed', 'Bearer gf_1234567890abcdef'],
    ['mixed case', 'bEaReR gf_1234567890abcdef'],
    ['lowercase', 'bearer gf_1234567890abcdef'],
    ['scheme only (no token)', 'Bearer'],
    ['surplus fields', 'Bearer gf_1234567890abcdef extra'],
    ['leading whitespace', '  Bearer tok'],
  ])('returns true for a %s bearer-scheme header', (_label, authHeader) => {
    expect(isBearerScheme(authHeader)).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['a foreign scheme (Basic)', 'Basic dXNlcjpwYXNz'],
    ['an unrecognized scheme', 'Token abc'],
    ['a scheme that merely contains "bearer"', 'Bearer2 tok'],
  ])('returns false for a %s header', (_label, authHeader) => {
    expect(isBearerScheme(authHeader)).toBe(false);
  });
});
