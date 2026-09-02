import { describe, expect, it } from 'vitest';
import { TEST_ID_LENGTH, testId, testIds } from './test-id.helper';

// Mirrors the Prisma `cuid()` shape accepted by `isEntityId` in @genfeedai/contracts/api-types.
const PRISMA_CUID_PATTERN = /^c[a-z0-9]{24}$/;

function shannonEntropyBitsPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

describe('testId', () => {
  it('builds a readable, cuid-shaped id from a label', () => {
    expect(testId('org')).toBe('corg000000000000000000001');
    expect(testId('org')).toHaveLength(TEST_ID_LENGTH);
    expect(testId('org')).toMatch(PRISMA_CUID_PATTERN);
  });

  it('is deterministic for the same label and sequence', () => {
    expect(testId('brand', 7)).toBe(testId('brand', 7));
    expect(testId('brand', 7)).toBe('cbrand0000000000000000007');
  });

  it('keeps distinct labels and sequences distinct', () => {
    expect(testId('user')).not.toBe(testId('post'));
    expect(testId('user', 1)).not.toBe(testId('user', 2));
    expect(testId('user', 12)).toBe('cuser00000000000000000012');
  });

  it('normalises labels to the cuid alphabet', () => {
    expect(testId('Organization-Member')).toBe(testId('organizationmember'));
    expect(testId('  Post 2 ')).toBe(testId('post2'));
  });

  it('stays far below secret-scanner entropy so it never reads as a leaked id', () => {
    for (const label of [
      'org',
      'brand',
      'user',
      'post',
      'organizationmember',
    ]) {
      expect(shannonEntropyBitsPerChar(testId(label))).toBeLessThan(4);
    }
  });

  it('rejects labels that leave no room for the sequence', () => {
    expect(() => testId('a'.repeat(24))).toThrow(/label/i);
    expect(() => testId('a'.repeat(23), 10)).toThrow(/label/i);
    expect(testId('a'.repeat(23), 9)).toBe(`c${'a'.repeat(23)}9`);
  });

  it('rejects empty labels and non-positive or fractional sequences', () => {
    expect(() => testId('')).toThrow(/label/i);
    expect(() => testId('---')).toThrow(/label/i);
    expect(() => testId('org', 0)).toThrow(/sequence/i);
    expect(() => testId('org', -1)).toThrow(/sequence/i);
    expect(() => testId('org', 1.5)).toThrow(/sequence/i);
  });
});

describe('testIds', () => {
  it('returns `count` sequential ids for one label', () => {
    expect(testIds('asset', 3)).toEqual([
      testId('asset', 1),
      testId('asset', 2),
      testId('asset', 3),
    ]);
  });

  it('returns an empty list for zero and rejects negative counts', () => {
    expect(testIds('asset', 0)).toEqual([]);
    expect(() => testIds('asset', -1)).toThrow(/count/i);
  });
});
