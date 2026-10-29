import type { TranscriptSegment } from './clip-srt.util';
import { buildSpokenScript } from './clipper-spoken-script.util';

describe('buildSpokenScript', () => {
  it('returns only what was said inside the window, in order', () => {
    const segments: TranscriptSegment[] = [
      { end: 5, start: 0, text: 'Welcome to the stream.' },
      { end: 20, start: 10, text: 'Shipping beats planning.' },
      { end: 28, start: 20, text: 'Every single time.' },
      { end: 40, start: 35, text: 'Anyway, thanks for watching.' },
    ];

    expect(buildSpokenScript(segments, 10, 30)).toBe(
      'Shipping beats planning. Every single time.',
    );
  });

  it('drops fillers and stutters without touching real words', () => {
    const segments: TranscriptSegment[] = [
      {
        end: 8,
        start: 0,
        text: 'Um, so so the the thing is, uh, we had had enough.',
      },
    ];

    expect(buildSpokenScript(segments, 0, 10)).toBe(
      'So the thing is, we had had enough.',
    );
  });

  it('drops a sentence that is said twice in a row', () => {
    const segments: TranscriptSegment[] = [
      { end: 4, start: 0, text: 'We ship on Fridays.' },
      { end: 8, start: 4, text: 'we ship on fridays' },
      { end: 12, start: 8, text: 'No exceptions.' },
    ];

    expect(buildSpokenScript(segments, 0, 12)).toBe(
      'We ship on Fridays. No exceptions.',
    );
  });

  it('cuts a segment that straddles the window by word timing', () => {
    const segments: TranscriptSegment[] = [
      {
        end: 6,
        start: 0,
        text: 'before the start after',
        words: [
          { end: 1, start: 0, word: 'before' },
          { end: 2, start: 1.5, word: 'the' },
          { end: 4, start: 3, word: 'start' },
          { end: 6, start: 5, word: 'after' },
        ],
      },
    ];

    expect(buildSpokenScript(segments, 3, 6)).toBe('Start after');
  });

  it('skips a segment that is only filler', () => {
    const segments: TranscriptSegment[] = [
      { end: 2, start: 0, text: 'Um, uh.' },
      { end: 6, start: 2, text: 'Here is the point.' },
    ];

    expect(buildSpokenScript(segments, 0, 6)).toBe('Here is the point.');
  });

  it('returns an empty string when nothing was said in the window', () => {
    expect(
      buildSpokenScript([{ end: 5, start: 0, text: 'Hello.' }], 20, 30),
    ).toBe('');
  });
});
