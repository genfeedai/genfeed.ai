import {
  formatSrtTimestamp,
  generateClipSrt,
  isTranscriptSegment,
  type TranscriptSegment,
} from './clip-srt.util';

const SEGMENTS: TranscriptSegment[] = [
  { end: 5, start: 2, text: 'Intro line' },
  { end: 20, start: 15, text: '  First highlight sentence  ' },
  { end: 25, start: 20, text: 'Second highlight sentence' },
  { end: 60, start: 40, text: 'Outro line' },
];

describe('isTranscriptSegment', () => {
  it('accepts complete numeric transcript segments', () => {
    expect(
      isTranscriptSegment({ end: 2, start: 1, text: 'Valid segment' }),
    ).toBe(true);
  });

  it('rejects malformed transcript segments', () => {
    expect(isTranscriptSegment({ end: '2', start: 1, text: 'Invalid' })).toBe(
      false,
    );
  });
});

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

  it('clamps phrases that straddle the window boundaries', () => {
    const srt = generateClipSrt(SEGMENTS, 15, 22);

    expect(srt).toContain('First highlight sentence');
    expect(srt).toContain('Second');
    expect(srt).not.toContain('00:00:08,');
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

  it('uses exact word timestamps and splits captions into short phrases', () => {
    const srt = generateClipSrt(
      [
        {
          end: 4,
          start: 0,
          text: 'One important phrase, then another useful phrase here',
          words: [
            { end: 0.4, start: 0.1, word: 'One' },
            { end: 0.8, start: 0.4, word: 'important' },
            { end: 1.2, start: 0.8, word: 'phrase,' },
            { end: 1.6, start: 1.3, word: 'then' },
            { end: 2, start: 1.6, word: 'another' },
            { end: 2.5, start: 2, word: 'useful' },
            { end: 3, start: 2.5, word: 'phrase' },
            { end: 3.5, start: 3, word: 'here' },
          ],
        },
      ],
      0,
      4,
    );

    expect(srt).toContain('One important phrase,');
    expect(srt).toContain('then another useful phrase here');
    expect(srt).toContain('00:00:00,060 -->');
    expect(srt).toContain('--> 00:00:01,300');
  });
});
