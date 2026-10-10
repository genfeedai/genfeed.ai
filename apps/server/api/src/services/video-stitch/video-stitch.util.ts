import type {
  VideoStitchJobParams,
  VideoStitchPlan,
  VideoStitchRequest,
} from '@api/services/video-stitch/video-stitch.types';
import { IngredientCategory, VideoTransition } from '@genfeedai/contracts';
import {
  VIDEO_DIMENSIONS,
  VIDEO_STITCH_LIMITS,
} from '@genfeedai/contracts/constants';
import type { IVideoMergeSettings } from '@genfeedai/contracts/interfaces';
import { assertStoredObjectKey } from '@libs/security/stored-object-key';
import { BadRequestException } from '@nestjs/common';

const STITCH_STORAGE_KEY = /^ingredients\/(videos|avatars)\/[^\s]+$/;

export function stitchRequestError(
  field: string,
  detail: string,
  title = 'Invalid stitch request',
): BadRequestException {
  return new BadRequestException({ detail, field, message: detail, title });
}

/** Merge settings persisted as JSON on an ingredient. */
export function readVideoMergeSettings(value: unknown): IVideoMergeSettings {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as IVideoMergeSettings)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isWithin(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function isDimension(value: number, max: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= max;
}

/**
 * The one option validation every stitch caller goes through. It refuses the
 * request with the failing field before anything is created or queued.
 * Clip and music ownership are checked against storage by the service.
 */
export function validateVideoStitchRequest(request: VideoStitchRequest): void {
  for (const field of [
    'organizationId',
    'brandId',
    'userId',
    'idempotencyKey',
  ] as const) {
    if (!isNonEmptyString(request[field])) {
      throw stitchRequestError(field, `${field} is required`);
    }
  }

  const { clipIds, mode, output, settings } = request;
  if (mode !== undefined && mode !== 'join' && mode !== 'finalize') {
    throw stitchRequestError('mode', 'Unsupported stitch mode');
  }
  // Finalizing a sequence or normalizing per clip still produces a
  // deliverable from a single clip; joining needs at least two.
  const minClips =
    mode === 'finalize' || output?.resize === 'per_clip'
      ? 1
      : VIDEO_STITCH_LIMITS.MIN_CLIPS;
  if (
    !Array.isArray(clipIds) ||
    clipIds.length < minClips ||
    clipIds.length > VIDEO_STITCH_LIMITS.MAX_CLIPS ||
    !clipIds.every(isNonEmptyString)
  ) {
    throw stitchRequestError(
      'clipIds',
      `Stitching takes ${minClips} to ${VIDEO_STITCH_LIMITS.MAX_CLIPS} clips`,
    );
  }

  const transitions: string[] = Object.values(VideoTransition);
  if (
    settings.transition !== undefined &&
    !transitions.includes(settings.transition)
  ) {
    throw stitchRequestError('transition', 'Unsupported transition');
  }
  if (
    settings.transitionDuration !== undefined &&
    !isWithin(
      settings.transitionDuration,
      VIDEO_STITCH_LIMITS.MIN_TRANSITION_DURATION,
      VIDEO_STITCH_LIMITS.MAX_TRANSITION_DURATION,
    )
  ) {
    throw stitchRequestError(
      'transitionDuration',
      `Transition duration must be ${VIDEO_STITCH_LIMITS.MIN_TRANSITION_DURATION}–${VIDEO_STITCH_LIMITS.MAX_TRANSITION_DURATION} seconds`,
    );
  }
  for (const field of ['isCaptionsEnabled', 'isMuteVideoAudio'] as const) {
    if (settings[field] !== undefined && typeof settings[field] !== 'boolean') {
      throw stitchRequestError(field, `${field} must be a boolean`);
    }
  }
  if (settings.music !== undefined && !isNonEmptyString(settings.music)) {
    throw stitchRequestError('music', 'Music must be a music asset id');
  }
  if (
    settings.musicVolume !== undefined &&
    !isWithin(
      settings.musicVolume,
      VIDEO_STITCH_LIMITS.MIN_MUSIC_VOLUME,
      VIDEO_STITCH_LIMITS.MAX_MUSIC_VOLUME,
    )
  ) {
    throw stitchRequestError(
      'musicVolume',
      `Music volume must be ${VIDEO_STITCH_LIMITS.MIN_MUSIC_VOLUME}–${VIDEO_STITCH_LIMITS.MAX_MUSIC_VOLUME}`,
    );
  }

  if (!output) {
    return;
  }
  if (
    !isDimension(output.width, VIDEO_DIMENSIONS.MAX_WIDTH) ||
    !isDimension(output.height, VIDEO_DIMENSIONS.MAX_HEIGHT)
  ) {
    throw stitchRequestError(
      'output',
      `Output dimensions must be whole pixels up to ${VIDEO_DIMENSIONS.MAX_WIDTH}×${VIDEO_DIMENSIONS.MAX_HEIGHT}`,
    );
  }
  if (output.resize !== 'after_merge' && output.resize !== 'per_clip') {
    throw stitchRequestError('output', 'Unsupported output resize mode');
  }
  // The worker's per-clip normalization joins with plain cuts and no music.
  if (output.resize === 'per_clip') {
    if (settings.music) {
      throw stitchRequestError(
        'music',
        'Per-clip normalized stitching cannot add music',
      );
    }
    if (settings.transition && settings.transition !== VideoTransition.NONE) {
      throw stitchRequestError(
        'transition',
        'Per-clip normalized stitching joins with cuts only',
      );
    }
  }
}

/**
 * Captions are transcribed from the merged video, so a mute without music is
 * applied after transcription (by the captions job) instead of in the merge.
 */
export function isMuteDeferredToCaptions(
  settings: IVideoMergeSettings,
): boolean {
  return Boolean(
    settings.isCaptionsEnabled && settings.isMuteVideoAudio && !settings.music,
  );
}

/** Stored object the worker downloads for a clip. */
export function resolveStitchClipStorageKey(
  clip: { category: string; id: string; s3Key: string | null },
  isAuthorizedDeliveryEnabled = false,
): string {
  if (isAuthorizedDeliveryEnabled) {
    if (!clip.s3Key || !/^ingredients\/(videos|avatars)\//.test(clip.s3Key)) {
      throw stitchRequestError('clipIds', 'Clip has no valid stored media key');
    }
    return assertStoredObjectKey(clip.s3Key, (message) =>
      stitchRequestError('clipIds', message),
    );
  }
  if (clip.s3Key && STITCH_STORAGE_KEY.test(clip.s3Key)) {
    return clip.s3Key;
  }
  const folder =
    clip.category === IngredientCategory.AVATAR ? 'avatars' : 'videos';
  return `ingredients/${folder}/${clip.id}`;
}

/**
 * The merge job payload. Identical plans yield identical payloads, whichever
 * caller asked.
 */
export function buildVideoStitchJobParams(
  plan: VideoStitchPlan,
): VideoStitchJobParams {
  const { output, settings } = plan;
  const transition = settings.transition ?? VideoTransition.NONE;
  const hasTransition = transition !== VideoTransition.NONE;

  return {
    isPersistedOutputOnly: true,
    sourceIds: plan.clipIds,
    sourceStorageKeys: plan.sourceStorageKeys,
    transition,
    ...(hasTransition && settings.transitionDuration !== undefined
      ? { transitionDuration: settings.transitionDuration }
      : {}),
    ...(settings.isMuteVideoAudio !== undefined &&
    !isMuteDeferredToCaptions(settings)
      ? { isMuteVideoAudio: settings.isMuteVideoAudio }
      : {}),
    ...(settings.music ? { music: settings.music } : {}),
    ...(plan.musicStorageKey ? { musicStorageKey: plan.musicStorageKey } : {}),
    ...(settings.music && settings.musicVolume !== undefined
      ? { musicVolume: settings.musicVolume / 100 }
      : {}),
    ...(output
      ? {
          height: output.height,
          ...(output.resize === 'per_clip'
            ? { normalizeClips: true }
            : { isResizeEnabled: true }),
          width: output.width,
        }
      : {}),
  };
}
