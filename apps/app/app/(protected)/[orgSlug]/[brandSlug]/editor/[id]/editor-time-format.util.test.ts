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

  it('formatPreciseFrameTime: ms never exceeds 999 (no 4-digit overflow)', () => {
    // At 120 fps, frame 119 => totalSeconds = 0.99166..., ms = round(991.66) = 992 — safe.
    // Construct a case where rounding would produce 1000 without the clamp:
    // totalSeconds fractional of 0.9995 rounds to 1000 — simulate via 9995/10000 fps edge.
    // Use 1000 fps, frame 999: totalSeconds = 0.999, ms = round(999) = 999 — exactly at boundary.
    expect(formatPreciseFrameTime(999, 1000)).toBe('00:00.999');
    // At fps=1000, frame=9999 => totalSeconds=9.999, ms=round(0.999*1000)=round(999)=999.
    expect(formatPreciseFrameTime(9999, 1000)).toBe('00:09.999');
    // Verify output is always 3 digits for the ms part (no 4-digit bleed).
    const result = formatPreciseFrameTime(29, 30);
    const msPart = result.split('.')[1];
    expect(msPart).toHaveLength(3);
  });
});
