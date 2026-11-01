import { describe, expect, it } from 'vitest';
import { getInitials } from './initials.helper';

describe('getInitials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['Ada Augusta King', 'AK'],
    ['  ada   lovelace  ', 'AL'],
    ['Genfeed', 'G'],
    ['@shipshit.dev', 'S'],
    ['@ada @lovelace', 'AL'],
    ['Émile Zola', 'ÉZ'],
    ['田中 太郎', '田太'],
    ['3 Body Problem', '3P'],
    ['', '?'],
    ['   ', '?'],
    ['---', '?'],
    [undefined, '?'],
    [null, '?'],
  ])('turns %j into %j', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });
});
