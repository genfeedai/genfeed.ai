import { REPOST_VARIANT_LIMITS } from '@genfeedai/contracts/constants';

export interface RepostVariantOptions {
  /** Flip left to right. */
  isMirrored?: boolean;
  /** Playback speed, 1 keeps it. Audio keeps its pitch. */
  speed?: number;
  /** Centre crop-in factor, 1 keeps the frame; 1.05 crops 5% and scales back. */
  zoom?: number;
  /** Seconds to cut from the start. */
  trimStartSeconds?: number;
}

export interface RepostVariantArgsInput extends RepostVariantOptions {
  hasAudio: boolean;
  inputPath: string;
  outputPath: string;
}

/** Throws when nothing would change or a value is outside the limits. */
export function normalizeRepostVariantOptions(
  options: RepostVariantOptions,
): Required<RepostVariantOptions> {
  const speed = options.speed ?? 1;
  const zoom = options.zoom ?? 1;
  const trimStartSeconds = options.trimStartSeconds ?? 0;
  const isMirrored = options.isMirrored === true;

  if (
    !Number.isFinite(speed) ||
    speed < 1 ||
    speed > REPOST_VARIANT_LIMITS.maxSpeed
  ) {
    throw new Error(
      `Speed must be between 1 and ${REPOST_VARIANT_LIMITS.maxSpeed}`,
    );
  }
  if (
    !Number.isFinite(zoom) ||
    zoom < 1 ||
    zoom > REPOST_VARIANT_LIMITS.maxZoom
  ) {
    throw new Error(
      `Zoom must be between 1 and ${REPOST_VARIANT_LIMITS.maxZoom}`,
    );
  }
  if (
    !Number.isFinite(trimStartSeconds) ||
    trimStartSeconds < 0 ||
    trimStartSeconds > REPOST_VARIANT_LIMITS.maxTrimStartSeconds
  ) {
    throw new Error(
      `Cut the start by 0 to ${REPOST_VARIANT_LIMITS.maxTrimStartSeconds} seconds`,
    );
  }
  if (!isMirrored && speed === 1 && zoom === 1 && trimStartSeconds === 0) {
    throw new Error('Pick at least one change for the variant');
  }

  return { isMirrored, speed, trimStartSeconds, zoom };
}

/**
 * One re-encode that applies every picked change, so a variant is a single new
 * version instead of a chain of copies. The zoom scales up then crops back to
 * the original size, so it needs no probe and follows the rotated frame.
 */
export function buildRepostVariantArgs(
  input: RepostVariantArgsInput,
): string[] {
  const { isMirrored, speed, trimStartSeconds, zoom } =
    normalizeRepostVariantOptions(input);

  const videoFilters: string[] = [];
  if (isMirrored) videoFilters.push('hflip');
  if (zoom > 1) {
    videoFilters.push(
      `scale=trunc(iw*${zoom}/2)*2:trunc(ih*${zoom}/2)*2`,
      `crop=trunc(iw/${zoom}/2)*2:trunc(ih/${zoom}/2)*2`,
    );
  } else {
    // yuv420p needs even sides; an even frame passes through unchanged.
    videoFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }
  if (speed > 1) videoFilters.push(`setpts=PTS/${speed}`);

  const args: string[] = [];
  if (trimStartSeconds > 0) args.push('-ss', String(trimStartSeconds));
  args.push('-i', input.inputPath);
  if (videoFilters.length > 0) args.push('-vf', videoFilters.join(','));
  if (input.hasAudio) {
    if (speed > 1) args.push('-af', `atempo=${speed}`);
  } else {
    args.push('-an');
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
  );
  if (input.hasAudio) args.push('-c:a', 'aac', '-b:a', '160k');
  args.push('-movflags', '+faststart', '-y', input.outputPath);

  return args;
}
