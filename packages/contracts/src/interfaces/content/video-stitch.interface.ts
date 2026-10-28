import type { BeatSyncCutStrategy, VideoTransition } from '../..';

/** Surfaces that join clips through the single stitch service (#5460). */
export const VIDEO_STITCH_CALLER_KINDS = [
  'manual',
  'auto_merge',
  'workflow',
  'storyboard_run',
] as const;

export type VideoStitchCallerKind = (typeof VIDEO_STITCH_CALLER_KINDS)[number];

export const VIDEO_STITCH_JOB_ID_PREFIX = 'stitch-';

/**
 * Deterministic merge job id for a stitch output. The files queue
 * deduplicates on it, so repeating an enqueue never creates a second job.
 */
export function videoStitchJobId(outputId: string): string {
  return `${VIDEO_STITCH_JOB_ID_PREFIX}${outputId}`;
}

export const VIDEO_STITCH_GENERATION_SOURCE_PREFIX = 'video-stitch:';

/** Lineage recorded on every stitched output's `generationSource`. */
export function videoStitchGenerationSource(
  callerKind: VideoStitchCallerKind,
): string {
  return `${VIDEO_STITCH_GENERATION_SOURCE_PREFIX}${callerKind}`;
}

/**
 * Join options a caller chooses for a stitch. Interpolation batches persist
 * them on each clip (`ingredients.mergeSettings`) so the webhook auto-merge
 * applies the settings captured when the batch started.
 */
export interface IVideoMergeSettings {
  /** Which beats of the music a cut may land on. Defaults to every beat. */
  beatSyncCutStrategy?: BeatSyncCutStrategy;
  /**
   * Trim each clip so the cuts land on the beat of the music. Needs music and
   * plain cuts; when the music has no steady beat the clips are joined as is.
   */
  isBeatSyncEnabled?: boolean;
  isCaptionsEnabled?: boolean;
  /**
   * Set to `false` to skip the brand end card for an output that is not the
   * final deliverable. Left unset, the brand's own setting decides.
   */
  isEndCardEnabled?: boolean;
  isMuteVideoAudio?: boolean;
  /** Music ingredient id. */
  music?: string;
  /** Background music volume, 0–100. */
  musicVolume?: number;
  transition?: VideoTransition;
  /** Seconds, VIDEO_STITCH_LIMITS transition bounds. */
  transitionDuration?: number;
}
