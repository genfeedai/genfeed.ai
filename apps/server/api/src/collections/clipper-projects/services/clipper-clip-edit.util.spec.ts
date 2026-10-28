import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { TranscriptSegment } from './clip-srt.util';
import {
  planClipEdit,
  selectTranscriptWindow,
  summarizeClip,
} from './clipper-clip-edit.util';

const TRANSCRIPT: TranscriptSegment[] = [
  { end: 12, start: 10, text: 'We almost shut the company down.' },
  { end: 18, start: 12, text: 'Then one customer changed everything for us.' },
  { end: 30, start: 20, text: 'Here is exactly what happened next.' },
  { end: 95, start: 90, text: 'Thanks for watching.' },
];

const FINISHED_CLIP = {
  endTime: 30,
  mode: 'raw-cut',
  startTime: 10,
  status: 'completed',
  title: 'The turnaround',
};

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  }
  throw new Error('expected the edit to be refused');
}

describe('planClipEdit', () => {
  it('re-cuts to the new window with captions rebuilt for it', () => {
    const plan = planClipEdit({
      request: { startTime: 12, endTime: 30 },
      sourceDurationSeconds: 120,
      subject: FINISHED_CLIP,
      transcriptSegments: TRANSCRIPT,
    });

    expect(plan).toMatchObject({ duration: 18, endTime: 30, startTime: 12 });
    expect(plan.captionSrt).toContain('Then one customer');
    expect(plan.captionSrt).not.toContain('almost shut');
    expect(plan.captionCueCount).toBeGreaterThan(0);
    expect(plan.captionSrt.startsWith('1\n00:00:00,')).toBe(true);
  });

  it('keeps the clip own times when only the title changes', () => {
    const plan = planClipEdit({
      request: { title: '  Better title  ' },
      subject: FINISHED_CLIP,
      transcriptSegments: TRANSCRIPT,
    });

    expect(plan).toMatchObject({
      endTime: 30,
      startTime: 10,
      title: 'Better title',
    });
  });

  it('names the edit after the clip when no title is given', () => {
    const plan = planClipEdit({
      request: { endTime: 28 },
      subject: FINISHED_CLIP,
      transcriptSegments: TRANSCRIPT,
    });

    expect(plan.title).toBe('The turnaround (edited)');
  });

  it('allows a failed clip to be re-cut, since failed is a finished state', () => {
    const plan = planClipEdit({
      request: { endTime: 28 },
      subject: { ...FINISHED_CLIP, status: 'failed' },
      transcriptSegments: TRANSCRIPT,
    });

    expect(plan.endTime).toBe(28);
  });

  it('refuses avatar clips and says what to do instead', () => {
    expect(
      messageOf(() =>
        planClipEdit({
          request: { endTime: 28 },
          subject: { ...FINISHED_CLIP, mode: 'avatar' },
          transcriptSegments: TRANSCRIPT,
        }),
      ),
    ).toContain('Only raw-cut clips can be edited');
  });

  it('refuses a clip that is still being produced', () => {
    expect(
      messageOf(() =>
        planClipEdit({
          request: { endTime: 28 },
          subject: { ...FINISHED_CLIP, status: 'extracting' },
          transcriptSegments: TRANSCRIPT,
        }),
      ),
    ).toContain('still being produced');
  });

  it.each([
    [{ startTime: -1 }, 'zero or greater'],
    [{ endTime: 10 }, 'greater than startTime'],
    [{ startTime: 29.5, endTime: 30 }, '1 to 180 seconds'],
    [{ startTime: 0, endTime: 200 }, '1 to 180 seconds'],
  ])('refuses the bad range %j', (request, reason) => {
    expect(
      messageOf(() =>
        planClipEdit({
          request,
          subject: FINISHED_CLIP,
          transcriptSegments: TRANSCRIPT,
        }),
      ),
    ).toContain(reason);
  });

  it('refuses a window past the end of the source video', () => {
    expect(
      messageOf(() =>
        planClipEdit({
          request: { endTime: 60 },
          sourceDurationSeconds: 45,
          subject: FINISHED_CLIP,
          transcriptSegments: TRANSCRIPT,
        }),
      ),
    ).toContain('past the end of the source video');
  });

  it('tolerates rounding at the very end of the source', () => {
    const plan = planClipEdit({
      request: { startTime: 90, endTime: 95.4 },
      sourceDurationSeconds: 95,
      subject: FINISHED_CLIP,
      transcriptSegments: TRANSCRIPT,
    });

    expect(plan.endTime).toBe(95.4);
  });

  it('refuses a window where nobody speaks', () => {
    expect(
      messageOf(() =>
        planClipEdit({
          request: { startTime: 40, endTime: 80 },
          subject: FINISHED_CLIP,
          transcriptSegments: TRANSCRIPT,
        }),
      ),
    ).toContain('Nobody speaks');
  });

  it('refuses a clip with no source time range', () => {
    expect(
      messageOf(() =>
        planClipEdit({
          request: { title: 'New' },
          subject: { mode: 'raw-cut', status: 'completed' },
          transcriptSegments: TRANSCRIPT,
        }),
      ),
    ).toContain('no source time range');
  });
});

describe('summarizeClip', () => {
  it('marks a finished raw-cut clip as editable', () => {
    expect(summarizeClip({ ...FINISHED_CLIP, id: 'clip-1' })).toEqual({
      clipperResultId: 'clip-1',
      duration: 20,
      endTime: 30,
      isEditable: true,
      mode: 'raw-cut',
      startTime: 10,
      status: 'completed',
      title: 'The turnaround',
    });
  });

  it.each([
    ['an avatar clip', { mode: 'avatar' }],
    ['an unfinished clip', { status: 'extracting' }],
  ])('marks %s as not editable', (_label, override) => {
    expect(
      summarizeClip({ ...FINISHED_CLIP, ...override, id: 'clip-2' }).isEditable,
    ).toBe(false);
  });

  it('reports a missing time range as null, not zero', () => {
    expect(summarizeClip({ id: 'clip-3' })).toMatchObject({
      duration: null,
      endTime: null,
      startTime: null,
      title: 'Clip',
    });
  });
});

describe('selectTranscriptWindow', () => {
  it('returns the lines near the clip, in order, and drops far ones', () => {
    const lines = selectTranscriptWindow([...TRANSCRIPT].reverse(), 10, 30);

    expect(lines.map((line) => line.start)).toEqual([10, 12, 20]);
  });

  it('includes the padding either side of the clip', () => {
    const lines = selectTranscriptWindow(TRANSCRIPT, 40, 50);

    expect(lines.map((line) => line.text)).toEqual([
      'Here is exactly what happened next.',
    ]);
  });

  it('caps the number of lines handed to the agent', () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      end: index + 0.5,
      start: index,
      text: `line ${index}`,
    }));

    expect(selectTranscriptWindow(many, 0, 500)).toHaveLength(120);
  });
});
