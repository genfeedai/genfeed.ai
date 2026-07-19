/**
 * Highlight-relative SRT generation for deterministic raw-cut clips.
 *
 * Salvaged from the removed `apps/server/clips` clipper-pipeline service
 * (pre-#1222 git history). Kept as pure functions so the caption offsets can
 * be unit-tested against fixtures independently of the generation service.
 */

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export function isTranscriptSegment(
  value: unknown,
): value is TranscriptSegment {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const segment = value as Record<string, unknown>;

  return (
    typeof segment.start === 'number' &&
    typeof segment.end === 'number' &&
    typeof segment.text === 'string'
  );
}

/**
 * Builds an SRT caption track for the `[clipStart, clipEnd]` window of a
 * source transcript, re-indexed from 1 and offset so timestamps are relative
 * to the trimmed clip rather than the original video.
 *
 * Segments that straddle either boundary are dropped (not clamped) so a caption
 * never references footage outside the cut.
 */
export function generateClipSrt(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
): string {
  const clipSegments = segments.filter(
    (seg) => seg.start >= clipStart && seg.end <= clipEnd,
  );

  return clipSegments
    .map((seg, idx) => {
      const relativeStart = seg.start - clipStart;
      const relativeEnd = seg.end - clipStart;
      return `${idx + 1}\n${formatSrtTimestamp(relativeStart)} --> ${formatSrtTimestamp(relativeEnd)}\n${seg.text.trim()}`;
    })
    .join('\n\n');
}

/**
 * Formats a duration in seconds as an `HH:MM:SS,mmm` SRT timestamp.
 */
export function formatSrtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const mins = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const ms = totalMilliseconds % 1000;

  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
