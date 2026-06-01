import { describe, expect, it } from 'vitest';
import {
  formatPlaybackFrameTime,
  formatPreciseFrameTime,
  formatTimelineFrameTime,
} from './editor-time-format.util';

describe('editor time formatting', () => {
  it('formats timeline ruler time with frame precision', () => {
    expect(formatTimelineFrameTime(0, 30)).toBe('00:00:00');
    expect(formatTimelineFrameTime(45, 30)).toBe('00:01:15');
    expect(formatTimelineFrameTime(1834, 30)).toBe('01:01:04');
  });

  it('formats playback time with centisecond precision', () => {
    expect(formatPlaybackFrameTime(0, 30)).toBe('00:00.00');
    expect(formatPlaybackFrameTime(45, 30)).toBe('00:01.50');
    expect(formatPlaybackFrameTime(1834, 30)).toBe('01:01.13');
  });

  it('formats clip property time with millisecond precision', () => {
    expect(formatPreciseFrameTime(0, 30)).toBe('00:00.000');
    expect(formatPreciseFrameTime(45, 30)).toBe('00:01.500');
    expect(formatPreciseFrameTime(1834, 30)).toBe('01:01.133');
  });
});
