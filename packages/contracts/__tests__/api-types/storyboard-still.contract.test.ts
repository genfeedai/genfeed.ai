import { describe, expect, it } from 'vitest';
import {
  generateStoryboardStillsSchema,
  quoteStoryboardStillsSchema,
  storyboardStillQuoteSchema,
} from '../../src/api-types/contracts/storyboard-still.contract';

const inputHash = 'a'.repeat(64);

describe('storyboard still contract', () => {
  it('quotes every eligible shot when no shot is named', () => {
    expect(quoteStoryboardStillsSchema.parse({ expectedRevision: 3 })).toEqual({
      expectedRevision: 3,
    });
    expect(
      quoteStoryboardStillsSchema.safeParse({
        expectedRevision: 3,
        shotIds: [],
      }).success,
    ).toBe(false);
  });

  it('refuses duplicate shots so one still is never charged twice', () => {
    expect(
      generateStoryboardStillsSchema.safeParse({
        expectedRevision: 3,
        shotIds: ['shot-1', 'shot-1'],
        inputHash,
      }).success,
    ).toBe(false);
  });

  it('requires the quote total to equal its lines', () => {
    const quote = {
      revision: 3,
      modelKey: 'black-forest-labs/flux-2-klein-4b',
      billingMode: 'platform',
      inputHash,
      items: [
        { shotId: 'shot-1', credits: 4 },
        { shotId: 'shot-2', credits: 4 },
      ],
      total: 8,
    };
    expect(storyboardStillQuoteSchema.parse(quote)).toEqual(quote);
    expect(
      storyboardStillQuoteSchema.safeParse({ ...quote, total: 4 }).success,
    ).toBe(false);
  });
});
