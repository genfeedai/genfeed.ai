import { describe, expect, it } from 'vitest';
import {
  formatStoryboardTimecode,
  snapStoryboardDuration,
  storyboardDurationStep,
  storyboardRuntimeRanges,
} from './storyboard-runtime';

describe('model-backed storyboard runtime', () => {
  it('snaps ties downward, fits the remaining budget and never invents a duration', () => {
    expect(snapStoryboardDuration(6, [4, 8], 20)).toBe(4);
    expect(snapStoryboardDuration(10, [4, 8, 12], 9)).toBe(8);
    expect(snapStoryboardDuration(3, [4, 8], 3)).toBeUndefined();
    expect(snapStoryboardDuration(7, [5, 8], 7)).toBeUndefined();
    expect(snapStoryboardDuration(61, [61], 70)).toBeUndefined();
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
  it('formats whole-second timecodes', () => {
    expect(formatStoryboardTimecode(0)).toBe('00:00');
    expect(formatStoryboardTimecode(5.9)).toBe('00:05');
    expect(formatStoryboardTimecode(75)).toBe('01:15');
  });
  it('steps the duration slider by the common divisor of the supported durations', () => {
    expect(storyboardDurationStep([5, 10])).toBe(5);
    expect(storyboardDurationStep([4, 6, 8])).toBe(2);
    expect(storyboardDurationStep([3, 5, 8])).toBe(1);
    expect(storyboardDurationStep([4.5, 9])).toBe(1);
    expect(storyboardDurationStep([])).toBe(1);
  });
});
