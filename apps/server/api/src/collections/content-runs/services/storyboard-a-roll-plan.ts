import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import { estimateAvatarSpeechSeconds } from '@api/collections/videos/services/avatar-video-duration.util';
import {
  STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS,
  STORYBOARD_A_ROLL_MAX_CHUNKS,
  type StoryboardARollChunk,
  type StoryboardARollPiece,
} from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { ConflictException } from '@nestjs/common';

/** A chunk the narration needs, before it is matched to an earlier render. */
export interface StoryboardARollChunkInput {
  pieces: StoryboardARollPiece[];
  text: string;
  fingerprint: string;
  estimatedSeconds: number;
}

/** Where two chunks meet: the B-roll overlay covers this point. */
export interface StoryboardARollJoin {
  afterChunkId: string;
  beforeChunkId: string;
  segmentId: string;
  characterOffset: number;
  /** Seconds into the A-roll, known once every earlier chunk has rendered. */
  atSeconds?: number;
}

interface SpeechUnit {
  segmentId: string;
  start: number;
  end: number;
  text: string;
}

const SENTENCE = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g;

/** Sentence ranges of one narration, trimmed, with their offsets. */
function sentenceUnits(segmentId: string, narration: string): SpeechUnit[] {
  const units: SpeechUnit[] = [];
  for (const match of narration.matchAll(SENTENCE)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = (match.index ?? 0) + leading;
    units.push({ segmentId, start, end: start + text.length, text });
  }
  return units;
}

/** Character offsets where each sentence of a narration starts. */
export function storyboardSentenceStarts(narration: string): number[] {
  return sentenceUnits('', narration).map((unit) => unit.start);
}

/** Splits a sentence longer than one render at word boundaries. */
function fitUnit(unit: SpeechUnit, max: number): SpeechUnit[] {
  if (unit.text.length <= max) return [unit];
  const parts: SpeechUnit[] = [];
  let offset = 0;
  while (offset < unit.text.length) {
    let end = Math.min(offset + max, unit.text.length);
    if (end < unit.text.length) {
      const space = unit.text.lastIndexOf(' ', end);
      if (space > offset) end = space;
    }
    const raw = unit.text.slice(offset, end);
    const text = raw.trim();
    if (text) {
      const start = unit.start + offset + (raw.length - raw.trimStart().length);
      parts.push({
        segmentId: unit.segmentId,
        start,
        end: start + text.length,
        text,
      });
    }
    offset = end;
  }
  return parts;
}

/** The presenter's avatar image and voice the chunks are rendered with. */
export interface StoryboardARollPresenter {
  presenterId: string;
  avatarAssetId: string;
  voiceId: string;
}

export function storyboardARollPresenter(
  plan: StoryboardPlan,
): StoryboardARollPresenter {
  const presenter = plan.cast.find(
    (member) => member.id === plan.longForm?.presenterId,
  );
  if (!presenter?.avatarAssetId || !presenter.voiceId)
    throw new ConflictException(
      'Give the presenter an avatar image and a voice before rendering.',
    );
  return {
    presenterId: presenter.id,
    avatarAssetId: presenter.avatarAssetId,
    voiceId: presenter.voiceId,
  };
}

/**
 * Splits the narration into renders of at most `maxCharacters`, at sentence
 * boundaries. Chunks fill up greedily so there are as few joins as possible;
 * a chunk may span segments because the presenter talks continuously.
 */
export function planStoryboardARollChunks(
  plan: StoryboardPlan,
  maxCharacters = STORYBOARD_A_ROLL_CHUNK_MAX_CHARACTERS,
): StoryboardARollChunkInput[] {
  const longForm = plan.longForm;
  if (!longForm?.segments.length)
    throw new ConflictException('This storyboard has no narration to render.');
  const presenter = storyboardARollPresenter(plan);
  const units = longForm.segments.flatMap((segment) =>
    sentenceUnits(segment.id, segment.narration).flatMap((unit) =>
      fitUnit(unit, maxCharacters),
    ),
  );

  const groups: SpeechUnit[][] = [];
  let current: SpeechUnit[] = [];
  let length = 0;
  for (const unit of units) {
    const added = (current.length ? 1 : 0) + unit.text.length;
    if (current.length && length + added > maxCharacters) {
      groups.push(current);
      current = [];
      length = 0;
    }
    current.push(unit);
    length += (current.length > 1 ? 1 : 0) + unit.text.length;
  }
  if (current.length) groups.push(current);
  if (groups.length > STORYBOARD_A_ROLL_MAX_CHUNKS)
    throw new ConflictException(
      'The narration is too long to render as one presenter track.',
    );

  return groups.map((group) => {
    const pieces: StoryboardARollPiece[] = [];
    for (const unit of group) {
      const last = pieces.at(-1);
      if (last?.segmentId === unit.segmentId) last.end = unit.end;
      else
        pieces.push({
          segmentId: unit.segmentId,
          start: unit.start,
          end: unit.end,
        });
    }
    const text = group.map((unit) => unit.text).join(' ');
    return {
      pieces,
      text,
      fingerprint: storyboardConfigHash({
        text,
        presenterId: presenter.presenterId,
        avatarAssetId: presenter.avatarAssetId,
        voiceId: presenter.voiceId,
        format: plan.format,
      }),
      estimatedSeconds: estimateAvatarSpeechSeconds(text),
    };
  });
}

/** Planned chunks matched to earlier renders of the same text, in order. */
export interface StoryboardARollMatch {
  input: StoryboardARollChunkInput;
  previous?: StoryboardARollChunk;
}

/**
 * Pairs each planned chunk with an earlier render of the same fingerprint, so
 * an edit to one segment re-renders only the chunks it changed. A failed
 * render is never reused.
 */
export function matchStoryboardARollChunks(
  planned: readonly StoryboardARollChunkInput[],
  previous: readonly StoryboardARollChunk[] = [],
): StoryboardARollMatch[] {
  const claimed = new Set<string>();
  return planned.map((input) => {
    const match = previous.find(
      (chunk) =>
        chunk.fingerprint === input.fingerprint &&
        chunk.state !== 'failed' &&
        !claimed.has(chunk.id),
    );
    if (match) claimed.add(match.id);
    return { input, ...(match ? { previous: match } : {}) };
  });
}

/** The joins between consecutive chunks, timed where durations are known. */
export function storyboardARollJoins(
  chunks: readonly StoryboardARollChunk[],
): StoryboardARollJoin[] {
  const joins: StoryboardARollJoin[] = [];
  let elapsed: number | undefined = 0;
  for (let index = 1; index < chunks.length; index++) {
    const before = chunks[index - 1];
    const after = chunks[index];
    const firstPiece = after?.pieces[0];
    if (!before || !after || !firstPiece) continue;
    elapsed =
      elapsed !== undefined && before.durationSeconds !== undefined
        ? elapsed + before.durationSeconds
        : undefined;
    joins.push({
      afterChunkId: before.id,
      beforeChunkId: after.id,
      segmentId: firstPiece.segmentId,
      characterOffset: firstPiece.start,
      ...(elapsed !== undefined ? { atSeconds: elapsed } : {}),
    });
  }
  return joins;
}
