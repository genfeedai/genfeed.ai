import { describe, expect, it } from 'vitest';
import {
  snapStoryboardDuration,
  storyboardRuntimeRanges,
} from './storyboard-runtime';

describe('model-backed storyboard runtime', () => {
  it('snaps ties downward, fits the remaining budget and never invents a duration', () => {
    expect(snapStoryboardDuration(6, [4, 8], 20)).toBe(4);
    expect(snapStoryboardDuration(10, [4, 8, 12], 9)).toBe(8);
    expect(snapStoryboardDuration(3, [4, 8], 3)).toBeUndefined();
    expect(snapStoryboardDuration(5, [], 20)).toBeUndefined();
    expect(snapStoryboardDuration(Number.NaN, [4], 20)).toBeUndefined();
  });
  it('preserves shot order and leaves incomplete durations unset in the total', () => {
    expect(
      storyboardRuntimeRanges([
        { id: 'b', durationSeconds: 3 },
        { id: 'a', durationSeconds: null },
        { id: 'c', durationSeconds: 5 },
      ]),
    ).toEqual([
      { id: 'b', startSeconds: 0, endSeconds: 3 },
      { id: 'a', startSeconds: 3, endSeconds: 3 },
      { id: 'c', startSeconds: 3, endSeconds: 8 },
    ]);
  });
});
