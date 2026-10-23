import { assertMinimaxH3ReferenceDurations } from '@api/collections/videos/services/minimax-h3-reference.util';
import { describe, expect, it } from 'vitest';

describe('H3 stored reference durations', () => {
  it.each([[2], [15], [5, 5, 5]])(
    'accepts bounded clips %j',
    (...durations) => {
      expect(() =>
        assertMinimaxH3ReferenceDurations(durations, 'audio'),
      ).not.toThrow();
    },
  );
  it.each([
    [0],
    [1.99],
    [15.01],
    [8, 8],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
  ])('rejects invalid clips %j', (...durations) => {
    expect(() => assertMinimaxH3ReferenceDurations(durations, 'audio')).toThrow(
      '2–15 seconds',
    );
  });
});
