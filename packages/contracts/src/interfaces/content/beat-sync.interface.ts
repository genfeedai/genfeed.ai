import { BeatSyncCutStrategy } from '../../enums/beat-sync.enum';

/** Tempo and beat times of a music track, in seconds from its start. */
export interface IBeatGrid {
  /** 0–1: how steady the pulse is. Below the minimum, cuts are not synced. */
  confidence: number;
  /** Every fourth beat, starting on the strongest bar position. */
  downbeats: number[];
  beatTimestamps: number[];
  tempo: number;
}

/** A detected grid weaker than this is not trusted to place cuts. */
export const BEAT_SYNC_MIN_CONFIDENCE = 0.3;
/** No synced clip is shorter than this. */
export const BEAT_SYNC_MIN_CLIP_SECONDS = 0.75;

/** The cut strategies a stitch can use. `CUSTOM` needs a pattern no caller sends. */
export const BEAT_SYNC_CUT_STRATEGIES: readonly BeatSyncCutStrategy[] = [
  BeatSyncCutStrategy.EVERY_BEAT,
  BeatSyncCutStrategy.EVERY_OTHER_BEAT,
  BeatSyncCutStrategy.DOWNBEATS_ONLY,
];

/** One clip of a beat-synced edit. */
export interface IBeatSyncedClip {
  /** Seconds of the clip kept; the rest is trimmed off its end. */
  durationSeconds: number;
  /** Where the clip ends on the music's clock. */
  endSeconds: number;
  /** Whether the cut landed on a beat; false when no beat fit the clip. */
  isOnBeat: boolean;
}

/** The beats a cut may land on under `strategy`. */
export function selectCutBeats(
  grid: Pick<IBeatGrid, 'beatTimestamps' | 'downbeats'>,
  strategy: BeatSyncCutStrategy,
): number[] {
  switch (strategy) {
    case BeatSyncCutStrategy.EVERY_OTHER_BEAT:
      return grid.beatTimestamps.filter((_, index) => index % 2 === 0);
    case BeatSyncCutStrategy.DOWNBEATS_ONLY:
      return grid.downbeats;
    default:
      return grid.beatTimestamps;
  }
}

/**
 * Trims the end of each clip so every cut lands on a beat of the music laid
 * under the whole edit. A clip is never stretched: a cut is the last beat the
 * clip still reaches, so every clip keeps its start and loses at most the
 * time to its previous beat. A clip no beat fits (all too close to its start,
 * or the music has run out) stays whole and is reported as off the beat.
 *
 * Video ends on a whole frame, so a cut can only land within half a frame of
 * its beat. With `frameSeconds` (one frame length per clip) each cut snaps to
 * the nearest frame and the next clip starts from where the video really
 * ends, so the error never builds up over the edit.
 */
export function planBeatSyncedCuts(
  clipDurations: readonly number[],
  cutBeats: readonly number[],
  minClipSeconds: number = BEAT_SYNC_MIN_CLIP_SECONDS,
  frameSeconds: readonly number[] = [],
): IBeatSyncedClip[] {
  const plan: IBeatSyncedClip[] = [];
  let cursor = 0;
  for (const [index, naturalDuration] of clipDurations.entries()) {
    const earliest = cursor + Math.min(minClipSeconds, naturalDuration);
    const latest = cursor + naturalDuration;
    let cut: number | undefined;
    for (const beat of cutBeats) {
      if (beat > latest) break;
      if (beat >= earliest) cut = beat;
    }
    const frame = frameSeconds[index];
    const endSeconds =
      cut !== undefined && frame && frame > 0
        ? Math.min(
            latest,
            cursor + Math.max(1, Math.round((cut - cursor) / frame)) * frame,
          )
        : (cut ?? latest);
    plan.push({
      durationSeconds: endSeconds - cursor,
      endSeconds,
      isOnBeat: cut !== undefined,
    });
    cursor = endSeconds;
  }
  return plan;
}

/**
 * The clip length, in seconds, closest to `targetSeconds` that still ends on
 * a cut under `strategy`: a whole number of beats, every other beat or bars.
 * For choosing how long to generate or place a clip before the music is cut.
 */
export function nearestBeatAlignedSeconds(
  tempo: number,
  targetSeconds: number,
  strategy: BeatSyncCutStrategy = BeatSyncCutStrategy.EVERY_BEAT,
): number {
  const beatsPerCut =
    strategy === BeatSyncCutStrategy.DOWNBEATS_ONLY
      ? 4
      : strategy === BeatSyncCutStrategy.EVERY_OTHER_BEAT
        ? 2
        : 1;
  const step = (60 / tempo) * beatsPerCut;
  return Math.max(step, Math.round(targetSeconds / step) * step);
}

/** One line telling a model or editor what the music's pulse allows. */
export function describeBeatGrid(
  grid: Pick<IBeatGrid, 'tempo'>,
  strategy: BeatSyncCutStrategy = BeatSyncCutStrategy.EVERY_BEAT,
): string {
  const beat = 60 / grid.tempo;
  const bar = beat * 4;
  const cutEvery =
    strategy === BeatSyncCutStrategy.DOWNBEATS_ONLY
      ? bar
      : strategy === BeatSyncCutStrategy.EVERY_OTHER_BEAT
        ? beat * 2
        : beat;
  return `The music runs at ${grid.tempo.toFixed(0)} BPM: a beat every ${beat.toFixed(2)}s and a bar every ${bar.toFixed(2)}s. Cuts land every ${cutEvery.toFixed(2)}s, so clip lengths that are a multiple of ${cutEvery.toFixed(2)}s (for example ${(cutEvery * 2).toFixed(1)}s, ${(cutEvery * 3).toFixed(1)}s) lose nothing to the cut.`;
}
