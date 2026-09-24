import {
  mergeRequestedSkillSlugs,
  normalizeRequestedSkillSlugs,
} from '@api/collections/skills/utils/requested-skill-slugs.util';
import { describe, expect, it } from 'vitest';

describe('requested skill selections', () => {
  it('normalizes and deduplicates valid selections in first-seen order', () => {
    expect(normalizeRequestedSkillSlugs(['Cinema', 'voice', 'cinema'])).toEqual(
      ['cinema', 'voice'],
    );
    expect(normalizeRequestedSkillSlugs([])).toBeUndefined();
  });
  it.each([
    null,
    'cinema',
    [''],
    ['bad_slug'],
    [' spaced '],
    [7],
    ['a'.repeat(161)],
    Array(9).fill('cinema'),
  ])('rejects malformed input %j', (value) => {
    expect(() => normalizeRequestedSkillSlugs(value)).toThrow(
      'Select up to 8 valid skills',
    );
  });
  it('unions context intent with tool input without mutating either', () => {
    const context = ['Cinema'];
    const input = ['cinema', 'voice'];
    expect(mergeRequestedSkillSlugs(context, input)).toEqual([
      'cinema',
      'voice',
    ]);
    expect(context).toEqual(['Cinema']);
    expect(input).toEqual(['cinema', 'voice']);
    expect(() =>
      mergeRequestedSkillSlugs(['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h', 'i']),
    ).toThrow();
  });
});
