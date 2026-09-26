import { describe, expect, it } from 'vitest';
import { parseAuthorizationHeader } from './authorization-header';

describe('parseAuthorizationHeader', () => {
  it('parses a well-formed header into scheme and token', () => {
    expect(parseAuthorizationHeader('Bearer gf_1234567890abcdef')).toEqual({
      scheme: 'Bearer',
      token: 'gf_1234567890abcdef',
    });
  });

  it('preserves the scheme as presented (case is left to the caller)', () => {
    expect(parseAuthorizationHeader('ApiKey gf_1234567890abcdef')).toEqual({
      scheme: 'ApiKey',
      token: 'gf_1234567890abcdef',
    });
  });

  it('tolerates surrounding whitespace around a well-formed header', () => {
    expect(parseAuthorizationHeader('  Bearer session-token  ')).toEqual({
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
