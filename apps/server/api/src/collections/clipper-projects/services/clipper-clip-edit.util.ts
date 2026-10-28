import {
  generateClipSrt,
  type TranscriptSegment,
} from '@api/collections/clipper-projects/services/clip-srt.util';
import { isTerminalClipStatus } from '@api/collections/clipper-shared/clipper-terminal-contract.util';
import {
  CLIPPER_CLIP_CONTEXT_LIMITS,
  CLIPPER_CLIP_EDIT_LIMITS,
  type IClipperClipEditRequest,
  type IClipperClipSummary,
  type IClipperTranscriptLine,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/** Half a second of slack: transcripts and probes round the source length differently. */
const SOURCE_END_TOLERANCE_SECONDS = 0.5;
const EDITED_TITLE_SUFFIX = ' (edited)';

export interface ClipEditSubject {
  endTime?: number | null;
  mode?: string | null;
  startTime?: number | null;
  status?: string | null;
  title?: string | null;
}

export interface ClipEditPlan {
  captionCueCount: number;
  captionSrt: string;
  duration: number;
  endTime: number;
  startTime: number;
  title: string;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function countCaptionCues(srt: string): number {
  return srt
    .trim()
    .split(/\n\s*\n/)
    .filter((block) => block.trim().length > 0).length;
}

/**
 * The new cut of a finished raw-cut clip, or the reason it cannot be made.
 * Nothing is queued here: a plan that comes back is one the pipeline can run,
 * with captions regenerated for the new window.
 */
export function planClipEdit(input: {
  request: Pick<IClipperClipEditRequest, 'endTime' | 'startTime' | 'title'>;
  sourceDurationSeconds?: number | null;
  subject: ClipEditSubject;
  transcriptSegments: TranscriptSegment[];
}): ClipEditPlan {
  const { request, sourceDurationSeconds, subject, transcriptSegments } = input;

  if (subject.mode !== 'raw-cut') {
    throw new BadRequestException(
      'Only raw-cut clips can be edited. Avatar clips are generated from a script, so change the script and generate again.',
    );
  }
  if (!isTerminalClipStatus(subject.status)) {
    throw new BadRequestException(
      'This clip is still being produced. Edit it once it has finished.',
    );
  }

  const startTime = request.startTime ?? readFiniteNumber(subject.startTime);
  const endTime = request.endTime ?? readFiniteNumber(subject.endTime);
  if (startTime === undefined || endTime === undefined) {
    throw new BadRequestException(
      'This clip has no source time range to edit from.',
    );
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new BadRequestException('startTime and endTime must be numbers.');
  }
  if (startTime < 0) {
    throw new BadRequestException('startTime must be zero or greater.');
  }
  if (endTime <= startTime) {
    throw new BadRequestException('endTime must be greater than startTime.');
  }

  const duration = endTime - startTime;
  const { MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } =
    CLIPPER_CLIP_EDIT_LIMITS;
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new BadRequestException(
      `An edited clip runs ${MIN_DURATION_SECONDS} to ${MAX_DURATION_SECONDS} seconds; this one would run ${duration.toFixed(1)}.`,
    );
  }
  // A persisted source length that is missing, zero or not a number is unknown.
  const knownSourceDuration = readFiniteNumber(sourceDurationSeconds);
  if (
    knownSourceDuration !== undefined &&
    knownSourceDuration > 0 &&
    endTime > knownSourceDuration + SOURCE_END_TOLERANCE_SECONDS
  ) {
    throw new BadRequestException(
      `endTime is past the end of the source video (${knownSourceDuration.toFixed(1)} seconds).`,
    );
  }

  const captionSrt = generateClipSrt(transcriptSegments, startTime, endTime);
  const captionCueCount = countCaptionCues(captionSrt);
  if (captionCueCount === 0) {
    throw new BadRequestException(
      'Nobody speaks between those times, so there is nothing to caption. Pick a window that includes speech.',
    );
  }

  const requestedTitle = request.title?.trim();
  const currentTitle = subject.title?.trim() || 'Clip';
  return {
    captionCueCount,
    captionSrt,
    duration,
    endTime,
    startTime,
    title: requestedTitle || `${currentTitle}${EDITED_TITLE_SUFFIX}`,
  };
}

export interface ClipSummarySubject extends ClipEditSubject {
  id: string;
}

/** The fields of a clip an agent needs to decide whether and how to edit it. */
export function summarizeClip(
  subject: ClipSummarySubject,
): IClipperClipSummary {
  const startTime = readFiniteNumber(subject.startTime) ?? null;
  const endTime = readFiniteNumber(subject.endTime) ?? null;
  return {
    clipperResultId: subject.id,
    duration:
      startTime !== null && endTime !== null ? endTime - startTime : null,
    endTime,
    isEditable:
      subject.mode === 'raw-cut' && isTerminalClipStatus(subject.status),
    mode: subject.mode ?? null,
    startTime,
    status: subject.status ?? null,
    title: subject.title?.trim() || 'Clip',
  };
}

/** Transcript lines overlapping the window plus padding, trimmed to the cap. */
export function selectTranscriptWindow(
  segments: TranscriptSegment[],
  startTime: number,
  endTime: number,
): IClipperTranscriptLine[] {
  const { MAX_TRANSCRIPT_SEGMENTS, TRANSCRIPT_PADDING_SECONDS } =
    CLIPPER_CLIP_CONTEXT_LIMITS;
  const from = startTime - TRANSCRIPT_PADDING_SECONDS;
  const to = endTime + TRANSCRIPT_PADDING_SECONDS;
  return segments
    .filter((segment) => segment.end > from && segment.start < to)
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_TRANSCRIPT_SEGMENTS)
    .map(({ end, start, text }) => ({ end, start, text: text.trim() }));
}
