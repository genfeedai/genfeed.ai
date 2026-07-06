import {
  formatSrtTimestamp,
  generateClipSrt,
  type TranscriptSegment,
} from './clip-srt.util';

const SEGMENTS: TranscriptSegment[] = [
  { end: 5, start: 2, text: 'Intro line' },
  { end: 20, start: 15, text: '  First highlight sentence  ' },
  { end: 25, start: 20, text: 'Second highlight sentence' },
  { end: 60, start: 40, text: 'Outro line' },
];

describe('formatSrtTimestamp', () => {
  it('formats zero as the SRT epoch', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
  });

  it('formats sub-second precision in milliseconds', () => {
    expect(formatSrtTimestamp(1.234)).toBe('00:00:01,234');
  });

  it('formats minutes and hours with zero padding', () => {
    expect(formatSrtTimestamp(3661.5)).toBe('01:01:01,500');
  });

  it('rolls rounded millisecond overflow into the next second', () => {
    expect(formatSrtTimestamp(59.9995)).toBe('00:01:00,000');
  });
});

describe('generateClipSrt', () => {
  it('emits only segments fully inside the highlight window, offset to the cut start', () => {
    const srt = generateClipSrt(SEGMENTS, 15, 25);

    expect(srt).toBe(
      [
        '1\n00:00:00,000 --> 00:00:05,000\nFirst highlight sentence',
        '2\n00:00:05,000 --> 00:00:10,000\nSecond highlight sentence',
      ].join('\n\n'),
    );
  });

  it('re-indexes captions from 1 relative to the selected window', () => {
    const srt = generateClipSrt(SEGMENTS, 15, 25);

    expect(srt.startsWith('1\n')).toBe(true);
    expect(srt).toContain('\n\n2\n');
  });

  it('excludes segments that straddle the window boundaries', () => {
    // A segment ending after clipEnd must be dropped, not clamped.
    const srt = generateClipSrt(SEGMENTS, 15, 22);

    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:05,000\nFirst highlight sentence',
    );
  });

  it('returns an empty string when no segment falls inside the window', () => {
    expect(generateClipSrt(SEGMENTS, 100, 120)).toBe('');
  });

  it('trims surrounding whitespace from segment text', () => {
    const srt = generateClipSrt(SEGMENTS, 15, 20);

    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:05,000\nFirst highlight sentence',
    );
  });
});
