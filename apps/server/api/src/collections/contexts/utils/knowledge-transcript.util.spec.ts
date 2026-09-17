import { describe, expect, it } from 'vitest';
import {
  chunkTranscriptCues,
  parseSrt,
  parseWebVtt,
} from './knowledge-transcript.util';

describe('knowledge transcript parsing', () => {
  it('parses WebVTT cues with millisecond offsets', () => {
    const cues = parseWebVtt(`WEBVTT

00:00:01.000 --> 00:00:02.500
Hello world

00:00:03.000 --> 00:00:04.000
Next line`);

    expect(cues).toEqual([
      { endMs: 2500, startMs: 1000, text: 'Hello world' },
      { endMs: 4000, startMs: 3000, text: 'Next line' },
    ]);
  });

  it('parses SRT cues and rejects inverted ranges', () => {
    expect(
      parseSrt(`1
00:00:01,000 --> 00:00:02,000
One`),
    ).toEqual([{ endMs: 2000, startMs: 1000, text: 'One' }]);
    expect(() =>
      parseSrt(`1
00:00:02,000 --> 00:00:01,000
Backwards`),
    ).toThrow('invalid timestamp range');
  });

  it('chunks cues across gaps and long cue splits', () => {
    const chunks = chunkTranscriptCues(
      [
        { endMs: 1000, startMs: 0, text: 'Hello' },
        { endMs: 5000, startMs: 4000, text: 'After gap' },
        {
          endMs: 6000,
          startMs: 5000,
          text: 'A'.repeat(1300),
        },
      ],
      (text) => [text.slice(0, 600), text.slice(600)],
    );

    expect(chunks[0]).toEqual({
      endMs: 1000,
      startMs: 0,
      text: 'Hello',
    });
    expect(chunks[1]).toEqual({
      endMs: 5000,
      startMs: 4000,
      text: 'After gap',
    });
    expect(chunks[2]?.startMs).toBe(5000);
    expect(chunks[2]?.endMs).toBe(6000);
    expect(chunks[3]?.text.startsWith('A')).toBe(true);
  });
});
