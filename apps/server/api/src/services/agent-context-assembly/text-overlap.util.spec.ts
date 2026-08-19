import {
  rankByQueryOverlap,
  scoreTextOverlap,
} from '@api/services/agent-context-assembly/text-overlap.util';
import { describe, expect, it } from 'vitest';

describe('text-overlap.util', () => {
  it('scores token overlap between query and text', () => {
    expect(
      scoreTextOverlap('launch week for founders', 'founders launch'),
    ).toBe(1);
    expect(scoreTextOverlap('unrelated caption', 'founders launch')).toBe(0);
  });

  it('ranks items by query overlap and leaves empty queries in original order', () => {
    const items = [
      { text: 'weekend recap' },
      { text: 'product launch for founders' },
      { text: 'office photo dump' },
    ];

    expect(
      rankByQueryOverlap(items, 'founder launch', (item) => item.text).map(
        (item) => item.text,
      ),
    ).toEqual([
      'product launch for founders',
      'weekend recap',
      'office photo dump',
    ]);

    expect(rankByQueryOverlap(items, '   ', (item) => item.text)).toEqual(
      items,
    );
  });
});
