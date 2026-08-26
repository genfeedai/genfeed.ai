import { describe, expect, it } from 'vitest';
import {
  replaceCharacterRuns,
  trimCharacter,
  trimTrailingCharacter,
} from './linear-string.util';

describe('linear string utilities', () => {
  it('removes every matching trailing character', () => {
    expect(trimTrailingCharacter('https://example.com///', '/')).toBe(
      'https://example.com',
    );
    expect(trimTrailingCharacter('https://example.com', '/')).toBe(
      'https://example.com',
    );
  });

  it('removes matching characters from both edges', () => {
    expect(trimCharacter('---hello---', '-')).toBe('hello');
    expect(trimCharacter('hello', '-')).toBe('hello');
  });

  it('replaces each matching run once', () => {
    expect(
      replaceCharacterRuns(
        'alpha---beta__gamma',
        (character) => character === '-' || character === '_',
        '.',
      ),
    ).toBe('alpha.beta.gamma');
  });

  it('handles long repeated input in a single pass', () => {
    expect(trimTrailingCharacter(`value${'/'.repeat(50_000)}`, '/')).toBe(
      'value',
    );
  });
  it('trims only leading or only trailing matches', () => {
    expect(trimCharacter('---hello', '-')).toBe('hello');
    expect(trimCharacter('hello---', '-')).toBe('hello');
  });

  it('returns an empty string when every character matches', () => {
    expect(trimCharacter('-----', '-')).toBe('');
  });
});
