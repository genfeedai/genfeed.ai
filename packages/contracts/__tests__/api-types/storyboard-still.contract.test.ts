import { describe, expect, it } from 'vitest';
import {
  generateStoryboardStillsSchema,
  parseStoryboardRunId,
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

  it('generates stills for shots or for cutaways, never both or neither', () => {
    expect(
      generateStoryboardStillsSchema.safeParse({
        expectedRevision: 3,
        cutawayIds: ['cutaway-1'],
        inputHash,
      }).success,
    ).toBe(true);
    expect(
      generateStoryboardStillsSchema.safeParse({
        expectedRevision: 3,
        shotIds: ['shot-1'],
        cutawayIds: ['cutaway-1'],
        inputHash,
      }).success,
    ).toBe(false);
    expect(
      generateStoryboardStillsSchema.safeParse({
        expectedRevision: 3,
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

describe('parseStoryboardRunId', () => {
  it('reads the run id out of a scene still or video key', () => {
    expect(parseStoryboardRunId('remix-clx9run123-scene-1-video-2')).toBe(
      'clx9run123',
    );
    expect(parseStoryboardRunId('remix-source:abc')).toBeNull();
  });

  it('reads the run id out of a still source action id', () => {
    expect(
      parseStoryboardRunId(
        'storyboard-still-clx9run123-4f9c1c0e-6a53-4d6a-9d0b-2d1f4f5a9b10',
      ),
    ).toBe('clx9run123');
  });

  it('ignores ingredients that are not storyboard stills', () => {
    expect(parseStoryboardRunId(null)).toBeNull();
    expect(parseStoryboardRunId('agent-source:abc')).toBeNull();
  });
});
