import { describe, expect, it } from 'vitest';
import { trimCharacter, trimTrailingCharacter } from './linear-string.util';

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

  it('trims only leading or only trailing matches', () => {
    expect(trimCharacter('---hello', '-')).toBe('hello');
    expect(trimCharacter('hello---', '-')).toBe('hello');
  });
});
