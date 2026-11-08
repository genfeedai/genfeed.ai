import { describe, expect, it } from 'vitest';
import {
  findReferralCodeProblem,
  parseReferralCode,
} from './affiliate-program.constant';

describe('findReferralCodeProblem', () => {
  it.each([
    ['shayla', null],
    ['launch10', null],
    ['itsshaylamonroe', null],
    ['  Launch-10  ', null],
    ['frend2345xyz', null],
    ['abc', null],
    ['x'.repeat(32), null],
    ['ab', 'invalid'],
    ['x'.repeat(33), 'invalid'],
    ['has space', 'invalid'],
    ['under_score', 'invalid'],
    ['-leading', 'invalid'],
    ['trailing-', 'invalid'],
    ['émoji', 'invalid'],
    ['', 'invalid'],
    ['admin', 'reserved'],
    ['  GenfeedAI ', 'reserved'],
    ['sign-up', 'reserved'],
  ])('%j is %j', (value, expected) => {
    expect(findReferralCodeProblem(value)).toBe(expected);
  });
});

describe('parseReferralCode', () => {
  it.each([
    ['ABCDEF23JKMN', 'abcdef23jkmn'],
    ['  Shayla ', 'shayla'],
    ['admin', 'admin'],
    ['not a code', null],
    ['code_with_1', null],
    ['ab', null],
    [null, null],
    [undefined, null],
  ])('%j parses to %j', (value, expected) => {
    expect(parseReferralCode(value)).toBe(expected);
  });
});
