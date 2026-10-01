export const HEYGEN_API_ORIGIN = 'https://api.heygen.com';
export const HEYGEN_VIDEO_MODEL_ID = 'heygen-video-1';
export const HEYGEN_VIDEO_CREATE_PATH = '/v3/models/videos';
export const HEYGEN_VIDEO_PROMPT_MAX = 5_000;
export const HEYGEN_VIDEO_MIN_DURATION = 5;
export const HEYGEN_VIDEO_MAX_DURATION = 15;
export const HEYGEN_VIDEO_DEFAULT_DURATION = 5;
export const HEYGEN_VIDEO_DEFAULT_RESOLUTION = '768p';
export const HEYGEN_VIDEO_MAX_IMAGES = 9;
export const HEYGEN_VIDEO_MAX_VIDEOS = 3;
export const HEYGEN_VIDEO_MAX_REFERENCES = 12;
export const HEYGEN_VIDEO_POLL_INTERVAL_MS = 5_000;
export const HEYGEN_VIDEO_POLL_TIMEOUT_MS = 600_000;

const HEYGEN_VIDEO_RESOLUTIONS = ['480p', '768p'] as const;
const HEYGEN_VIDEO_ASPECT_RATIOS = [
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
] as const;

export type HeyGenVideoResolution = (typeof HEYGEN_VIDEO_RESOLUTIONS)[number];
export type HeyGenVideoAspectRatio =
  (typeof HEYGEN_VIDEO_ASPECT_RATIOS)[number];
export type HeyGenVideoMode =
  | 'image_to_video'
  | 'reference_to_video'
  | 'text_to_video';

export interface HeyGenUrlAsset {
  type: 'url';
  url: string;
}

export interface HeyGenVideoCreateBody {
  aspect_ratio?: HeyGenVideoAspectRatio;
  duration: number;
  image?: HeyGenUrlAsset;
  mode: HeyGenVideoMode;
  model: typeof HEYGEN_VIDEO_MODEL_ID;
  prompt: string;
  prompt_enhancement: 'disabled';
  reference_images?: HeyGenUrlAsset[];
  reference_videos?: HeyGenUrlAsset[];
  resolution: HeyGenVideoResolution;
  seed?: number;
}

export interface HeyGenVideoCreateInput {
  aspectRatio?: string;
  duration?: number;
  imageUrls: readonly string[];
  prompt: string;
  resolution?: string;
  seed?: number;
  videoUrls: readonly string[];
}

export interface HeyGenVideoStatus {
  failureMessage?: string;
  status: string;
  videoUrl?: string;
}

function uniqueHttps(urls: readonly string[]): string[] {
  return [
    ...new Set(
      urls.map((url) => url.trim()).filter((url) => url.startsWith('https://')),
    ),
  ];
}

function urlAsset(url: string): HeyGenUrlAsset {
  return { type: 'url', url };
}

function clampDuration(duration: number | undefined): number {
  const requested = Number.isFinite(duration)
    ? Math.round(duration as number)
    : HEYGEN_VIDEO_DEFAULT_DURATION;
  return Math.min(
    HEYGEN_VIDEO_MAX_DURATION,
    Math.max(HEYGEN_VIDEO_MIN_DURATION, requested),
  );
}

function resolveResolution(
  resolution: string | undefined,
): HeyGenVideoResolution {
  return (
    HEYGEN_VIDEO_RESOLUTIONS.find((value) => value === resolution) ??
    HEYGEN_VIDEO_DEFAULT_RESOLUTION
  );
}

function resolveAspectRatio(
  aspectRatio: string | undefined,
): HeyGenVideoAspectRatio {
  return (
    HEYGEN_VIDEO_ASPECT_RATIOS.find((value) => value === aspectRatio) ?? '16:9'
  );
}

/**
 * Builds the strict HeyGen Video create body. Image-to-video takes one still
 * and omits aspect ratio. Any extra still or a reference clip uses
 * reference-to-video and also omits aspect ratio so HeyGen keeps its
 * adaptive framing.
 */
export function buildHeyGenVideoCreateBody(
  input: HeyGenVideoCreateInput,
): HeyGenVideoCreateBody {
  const prompt = input.prompt.trim().slice(0, HEYGEN_VIDEO_PROMPT_MAX);
  if (!prompt) {
    throw new Error('HeyGen Video requires a prompt.');
  }

  const imageUrls = uniqueHttps(input.imageUrls);
  const videoUrls = uniqueHttps(input.videoUrls);
  if (imageUrls.length > HEYGEN_VIDEO_MAX_IMAGES) {
    throw new Error(
      `HeyGen Video accepts at most ${HEYGEN_VIDEO_MAX_IMAGES} images.`,
    );
  }
  if (videoUrls.length > HEYGEN_VIDEO_MAX_VIDEOS) {
    throw new Error(
      `HeyGen Video accepts at most ${HEYGEN_VIDEO_MAX_VIDEOS} videos.`,
    );
  }
  if (imageUrls.length + videoUrls.length > HEYGEN_VIDEO_MAX_REFERENCES) {
    throw new Error(
      `HeyGen Video accepts at most ${HEYGEN_VIDEO_MAX_REFERENCES} references.`,
    );
  }

  const mode: HeyGenVideoMode =
    videoUrls.length > 0 || imageUrls.length > 1
      ? 'reference_to_video'
      : imageUrls.length === 1
        ? 'image_to_video'
        : 'text_to_video';

  const seed =
    typeof input.seed === 'number' &&
    Number.isInteger(input.seed) &&
    input.seed >= 0 &&
    input.seed <= 0xff_ff_ff_ff
      ? input.seed
      : undefined;

  return {
    duration: clampDuration(input.duration),
    mode,
    model: HEYGEN_VIDEO_MODEL_ID,
    prompt,
    prompt_enhancement: 'disabled',
    resolution: resolveResolution(input.resolution),
    ...(seed === undefined ? {} : { seed }),
    ...(mode === 'text_to_video'
      ? { aspect_ratio: resolveAspectRatio(input.aspectRatio) }
      : {}),
    ...(mode === 'image_to_video' && imageUrls[0]
      ? { image: urlAsset(imageUrls[0]) }
      : {}),
    ...(mode === 'reference_to_video' && imageUrls.length > 0
      ? { reference_images: imageUrls.map(urlAsset) }
      : {}),
    ...(mode === 'reference_to_video' && videoUrls.length > 0
      ? { reference_videos: videoUrls.map(urlAsset) }
      : {}),
  };
}

export function heyGenVideoStatusUrl(videoId: string): string {
  return `${HEYGEN_API_ORIGIN}${HEYGEN_VIDEO_CREATE_PATH}/${encodeURIComponent(videoId)}`;
}

export function readHeyGenVideoId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const videoId = (data as { video_id?: unknown }).video_id;
  return typeof videoId === 'string' && videoId.trim()
    ? videoId.trim()
    : undefined;
}

export function readHeyGenVideoStatus(payload: unknown): HeyGenVideoStatus {
  if (!payload || typeof payload !== 'object') {
    return { status: 'pending' };
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return { status: 'pending' };
  }
  const record = data as {
    failure_message?: unknown;
    status?: unknown;
    video_url?: unknown;
  };
  return {
    ...(typeof record.failure_message === 'string'
      ? { failureMessage: record.failure_message }
      : {}),
    status: typeof record.status === 'string' ? record.status : 'pending',
    ...(typeof record.video_url === 'string' &&
    record.video_url.startsWith('https://')
      ? { videoUrl: record.video_url }
      : {}),
  };
}

export function isHeyGenVideoTerminal(status: string): boolean {
  return (
    status === 'completed' || status === 'failed' || status === 'cancelled'
  );
}
