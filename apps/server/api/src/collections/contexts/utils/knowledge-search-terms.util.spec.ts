import {
  extractExactTerms,
  MAX_EXACT_TERMS,
} from '@api/collections/contexts/utils/knowledge-search-terms.util';
import { describe, expect, it } from 'vitest';

describe('extractExactTerms', () => {
  it.each([
    ['What does the Zephyr-9 cost?', ['Zephyr-9']],
    ['Tell me about the Summer Splash campaign', ['Summer', 'Splash']],
    ['pricing for the starter tier', []],
    ['firmware v2.1 release notes', ['v2.1']],
    ['how do we use GenFeed and NASA data', ['GenFeed', 'NASA']],
    ['SKU123 stock', ['SKU123']],
  ])('finds the exact names in %j', (query, expected) => {
    expect(extractExactTerms(query)).toEqual(expected);
  });

  it('keeps quoted phrases whole and ignores the stop words around them', () => {
    expect(extractExactTerms('Find "launch week" and the Q3 plan')).toEqual([
      'launch week',
      'Q3',
    ]);
  });

  it('lists a name once whatever its case, and never more than the cap', () => {
    expect(extractExactTerms('Zephyr-9 zephyr-9 ZEPHYR-9')).toEqual([
      'Zephyr-9',
    ]);
    const many = Array.from({ length: 20 }, (_, i) => `Item-${i}`).join(' ');
    expect(extractExactTerms(many)).toHaveLength(MAX_EXACT_TERMS);
  });

  it('never returns a term longer than a passage name can be', () => {
    expect(extractExactTerms(`"${'x'.repeat(200)}"`)).toEqual([]);
  });
});
