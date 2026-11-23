import { AdsPlatform } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { getCompetitorSuggestions } from './useAdsResearchWatchlist';

const watched = [
  {
    advertiserHandle: 'arcads.ai',
    advertiserName: 'Arcads',
    freshnessState: 'fresh' as const,
    id: 'watched-1',
    platform: AdsPlatform.META,
  },
];

describe('getCompetitorSuggestions', () => {
  it('suggests the competitors the brand names that are not watched yet', () => {
    expect(getCompetitorSuggestions(['Argil', ' Creatify '], watched)).toEqual([
      'Argil',
      'Creatify',
    ]);
  });

  it('leaves out a competitor already watched by handle or name, however it is written', () => {
    expect(
      getCompetitorSuggestions(
        ['https://www.arcads.ai', '@Arcads', 'ARCADS.AI', 'Argil'],
        watched,
      ),
    ).toEqual(['Argil']);
  });

  it('lists a repeated competitor once and ignores blanks', () => {
    expect(getCompetitorSuggestions(['Argil', 'argil', ' ', ''], [])).toEqual([
      'Argil',
    ]);
  });

  it('suggests nothing when the brand names no competitor', () => {
    expect(getCompetitorSuggestions(undefined, watched)).toEqual([]);
  });
});
