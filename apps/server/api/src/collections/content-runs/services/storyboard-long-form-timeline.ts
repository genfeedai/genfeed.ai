import {
  storyboardARollJoins,
  storyboardSentenceStarts,
} from '@api/collections/content-runs/services/storyboard-a-roll-plan';
import type { StoryboardARollChunk } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type {
  StoryboardCutaway,
  StoryboardPlan,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';

/**
 * Picture lags the voice by this much at every cut: the presenter starts the
 * line, then the B-roll comes in or goes out (a J-cut). Cuts that land on the
 * first syllable read as jumpy.
 */
export const LONG_FORM_J_CUT_LEAD_SECONDS = 0.33;
/** A cut this close to a sentence start snaps to it. */
export const LONG_FORM_SENTENCE_SNAP_SECONDS = 1;
/** B-roll covers each A-roll join by at least this much on both sides. */
export const LONG_FORM_JOIN_COVER_SECONDS = 0.5;
/** A cutaway this close to a join is stretched to cover it. */
export const LONG_FORM_JOIN_STRETCH_SECONDS = 3;
/** Shortest cutaway worth showing; shorter ones read as a flash. */
export const LONG_FORM_MIN_CUTAWAY_SECONDS = 1;

export interface LongFormARollPlacement {
  chunkId: string;
  assetId: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface LongFormCutawayPlacement {
  cutawayId: string;
  segmentId: string;
  kind: StoryboardCutaway['kind'];
  assetId?: string;
  startSeconds: number;
  durationSeconds: number;
  /** Stretched so it hides a join between two presenter renders. */
  isJoinCover: boolean;
}

export interface LongFormTimeline {
  totalSeconds: number;
  aRoll: LongFormARollPlacement[];
  cutaways: LongFormCutawayPlacement[];
  /** Seconds of each presenter join no cutaway covers. */
  uncoveredJoins: number[];
}

/** Seconds into the A-roll where a narration character is spoken. */
function speechClock(chunks: readonly StoryboardARollChunk[]) {
  const spans: {
    segmentId: string;
    start: number;
    end: number;
    fromSeconds: number;
    secondsPerCharacter: number;
  }[] = [];
  let elapsed = 0;
  for (const chunk of chunks) {
    const seconds = chunk.durationSeconds ?? chunk.estimatedSeconds;
    const perCharacter = seconds / chunk.text.length;
    let position = 0;
    for (const piece of chunk.pieces) {
      spans.push({
        segmentId: piece.segmentId,
        start: piece.start,
        end: piece.end,
        fromSeconds: elapsed + position * perCharacter,
        secondsPerCharacter: perCharacter,
      });
      // Pieces are joined with one space in the chunk text.
      position += piece.end - piece.start + 1;
    }
    elapsed += seconds;
  }
  return {
    totalSeconds: elapsed,
    at(segmentId: string, offset: number): number | undefined {
      const span =
        spans.find(
          (item) =>
            item.segmentId === segmentId &&
            offset >= item.start &&
            offset < item.end,
        ) ??
        spans.find(
          (item) => item.segmentId === segmentId && offset < item.start,
        );
      if (!span) return undefined;
      return (
        span.fromSeconds +
        Math.max(0, offset - span.start) * span.secondsPerCharacter
      );
    },
  };
}

function round(seconds: number): number {
  return Math.round(seconds * 1_000) / 1_000;
}

/** Moves a cut to just after the nearest sentence start, if one is close. */
function snapToSentence(seconds: number, starts: readonly number[]): number {
  let best: number | undefined;
  for (const start of starts) {
    const distance = Math.abs(start - seconds);
    if (
      distance <= LONG_FORM_SENTENCE_SNAP_SECONDS &&
      (best === undefined || distance < Math.abs(best - seconds))
    )
      best = start;
  }
  return best === undefined ? seconds : best + LONG_FORM_J_CUT_LEAD_SECONDS;
}

/**
 * Lays the long-form edit out in seconds: presenter renders back to back on
 * the A-roll, cutaways over it at the moment their narration is spoken,
 * scaled from the drafted estimate to the measured speech. Cuts snap to just
 * after a sentence starts (J-cut), and cutaways near a join between two
 * renders stretch to hide it. Cutaways never overlap.
 */
export function buildLongFormTimeline(
  plan: StoryboardPlan,
  chunks: readonly StoryboardARollChunk[],
): LongFormTimeline {
  const segments = plan.longForm?.segments ?? [];
  const clock = speechClock(chunks);
  const aRoll: LongFormARollPlacement[] = [];
  let elapsed = 0;
  for (const chunk of chunks) {
    const seconds = chunk.durationSeconds ?? chunk.estimatedSeconds;
    if (chunk.assetId)
      aRoll.push({
        chunkId: chunk.id,
        assetId: chunk.assetId,
        startSeconds: round(elapsed),
        durationSeconds: round(seconds),
      });
    elapsed += seconds;
  }

  const sentenceStarts = segments.flatMap((segment) =>
    storyboardSentenceStarts(segment.narration).flatMap((offset) => {
      const at = clock.at(segment.id, offset);
      return at === undefined ? [] : [at];
    }),
  );

  const placed: LongFormCutawayPlacement[] = [];
  segments.forEach((segment, index) => {
    const from = clock.at(segment.id, 0);
    if (from === undefined) return;
    const next = segments[index + 1];
    const until =
      (next ? clock.at(next.id, 0) : undefined) ?? clock.totalSeconds;
    const scale = (until - from) / segment.estimatedSeconds;
    for (const cutaway of segment.cutaways) {
      const start = snapToSentence(
        from + cutaway.startSeconds * scale,
        sentenceStarts,
      );
      const end = Math.min(
        snapToSentence(
          from + (cutaway.startSeconds + cutaway.durationSeconds) * scale,
          sentenceStarts,
        ),
        until,
      );
      placed.push({
        cutawayId: cutaway.id,
        segmentId: segment.id,
        kind: cutaway.kind,
        ...(cutaway.assetId ? { assetId: cutaway.assetId } : {}),
        startSeconds: start,
        durationSeconds: end - start,
        isJoinCover: false,
      });
    }
  });

  const joins = storyboardARollJoins(
    chunks.map((chunk) => ({
      ...chunk,
      durationSeconds: chunk.durationSeconds ?? chunk.estimatedSeconds,
    })),
  ).flatMap((join) => (join.atSeconds === undefined ? [] : [join.atSeconds]));
  const uncoveredJoins: number[] = [];
  for (const join of joins) {
    const coverFrom = join - LONG_FORM_JOIN_COVER_SECONDS;
    const coverTo = join + LONG_FORM_JOIN_COVER_SECONDS;
    if (
      placed.some(
        (item) =>
          item.startSeconds <= coverFrom &&
          item.startSeconds + item.durationSeconds >= coverTo,
      )
    )
      continue;
    const nearest = placed
      .map((item) => ({
        item,
        gap: Math.max(
          0,
          item.startSeconds - coverFrom,
          coverTo - (item.startSeconds + item.durationSeconds),
        ),
      }))
      .filter(({ gap }) => gap <= LONG_FORM_JOIN_STRETCH_SECONDS)
      .sort((left, right) => left.gap - right.gap)[0]?.item;
    if (!nearest) {
      uncoveredJoins.push(round(join));
      continue;
    }
    const end = Math.max(
      nearest.startSeconds + nearest.durationSeconds,
      coverTo,
    );
    nearest.startSeconds = Math.min(nearest.startSeconds, coverFrom);
    nearest.durationSeconds = end - nearest.startSeconds;
    nearest.isJoinCover = true;
  }

  // One cutaway at a time: a later one starts where the earlier one ends,
  // and one squeezed below the minimum is dropped unless it covers a join.
  const cutaways: LongFormCutawayPlacement[] = [];
  let coveredUntil = 0;
  for (const item of [...placed].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  )) {
    const start = Math.max(item.startSeconds, coveredUntil, 0);
    const end = Math.min(
      item.startSeconds + item.durationSeconds,
      clock.totalSeconds,
    );
    if (end - start < LONG_FORM_MIN_CUTAWAY_SECONDS && !item.isJoinCover)
      continue;
    if (end <= start) continue;
    cutaways.push({
      ...item,
      startSeconds: round(start),
      durationSeconds: round(end - start),
    });
    coveredUntil = end;
  }

  return {
    totalSeconds: round(clock.totalSeconds),
    aRoll,
    cutaways,
    uncoveredJoins,
  };
}

/** One caption on screen: at most two short lines of the spoken script. */
export interface LongFormCaption {
  text: string;
  startSeconds: number;
  durationSeconds: number;
}

/** Splits a sentence at word boundaries into pieces of at most `max` characters. */
function captionPieces(
  sentence: string,
  max: number,
): { offset: number; text: string }[] {
  const pieces: { offset: number; text: string }[] = [];
  let current: { offset: number; text: string } | undefined;
  for (const word of sentence.matchAll(/\S+/gu)) {
    const offset = word.index ?? 0;
    if (current && offset + word[0].length - current.offset <= max) {
      current.text = sentence.slice(current.offset, offset + word[0].length);
      continue;
    }
    current = { offset, text: word[0] };
    pieces.push(current);
  }
  return pieces;
}

/**
 * Captions from the rendered speech (#8218): each sentence of every render,
 * split at word boundaries into cues of at most `maxCharacters`, timed at
 * that render's measured speaking rate. A cue stays up until the next one,
 * so the captions never blink off mid-sentence. A copy in another language
 * gets its captions from its own renders.
 */
export function buildLongFormCaptions(
  chunks: readonly StoryboardARollChunk[],
  maxCharacters: number,
): LongFormCaption[] {
  const captions: LongFormCaption[] = [];
  let elapsed = 0;
  for (const chunk of chunks) {
    const seconds = chunk.durationSeconds ?? chunk.estimatedSeconds;
    const perCharacter = seconds / chunk.text.length;
    const cues = storyboardSentenceStarts(chunk.text).flatMap(
      (start, index, starts) =>
        captionPieces(
          chunk.text.slice(start, starts[index + 1] ?? chunk.text.length),
          maxCharacters,
        ).map((piece) => ({ ...piece, offset: start + piece.offset })),
    );
    cues.forEach((cue, index) => {
      const until = cues[index + 1]?.offset ?? chunk.text.length;
      captions.push({
        text: cue.text,
        startSeconds: round(elapsed + cue.offset * perCharacter),
        durationSeconds: round((until - cue.offset) * perCharacter),
      });
    });
    elapsed += seconds;
  }
  return captions;
}
