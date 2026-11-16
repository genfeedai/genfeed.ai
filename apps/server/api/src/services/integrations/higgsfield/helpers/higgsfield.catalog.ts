import { ASPECT_RATIOS, MODEL_KEYS } from '@genfeedai/contracts/constants';

/**
 * Documented production host. Model pages post to this origin, not
 * `platform.higgsfield.ai`. Overridable with `HIGGSFIELD_API_BASE_URL`.
 *
 * @see https://docs.higgsfield.ai/docs
 */
export const HIGGSFIELD_API_BASE = 'https://api.higgsfield.ai';

/**
 * Authenticated probe used to validate BYOK credentials. Listed on the Soul 2
 * model page; a 401 means the key is wrong, anything else means the account
 * answered.
 */
export const HIGGSFIELD_CREDENTIAL_PROBE_PATH = '/v1/text2image/soul-styles/v2';

export const HIGGSFIELD_SOUL_ENDPOINT = MODEL_KEYS.HIGGSFIELD_SOUL;

const SOUL_ENDPOINTS: ReadonlySet<string> = new Set([
  MODEL_KEYS.HIGGSFIELD_SOUL,
  MODEL_KEYS.HIGGSFIELD_SOUL_STANDARD,
  MODEL_KEYS.HIGGSFIELD_SOUL_CINEMA,
]);

/** Soul 2, Soul Standard and Soul Cinema share one request shape. */
export function isHiggsFieldSoulModel(modelKey: string): boolean {
  return SOUL_ENDPOINTS.has(modelKey);
}

/** Catalog model key → Soul endpoint id; unknown keys fall back to Soul 2. */
export function resolveSoulEndpoint(modelKey: string | undefined): string {
  return modelKey && SOUL_ENDPOINTS.has(modelKey)
    ? modelKey
    : HIGGSFIELD_SOUL_ENDPOINT;
}

/** Soul 2 documented `aspect_ratio` values. Unknown ratios snap to the default. */
const HIGGSFIELD_SOUL_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
] as const;

export type HiggsFieldSoulAspectRatio =
  (typeof HIGGSFIELD_SOUL_ASPECT_RATIOS)[number];

const HIGGSFIELD_SOUL_DEFAULT_ASPECT_RATIO: HiggsFieldSoulAspectRatio = '4:3';

export type HiggsFieldSoulQuality = '720p' | '1080p';

const SOUL_ASPECT_RATIO_SET: ReadonlySet<string> = new Set(
  HIGGSFIELD_SOUL_ASPECT_RATIOS,
);

export function toSoulAspectRatio(
  aspectRatio: string | undefined,
): HiggsFieldSoulAspectRatio {
  if (aspectRatio && SOUL_ASPECT_RATIO_SET.has(aspectRatio)) {
    return aspectRatio as HiggsFieldSoulAspectRatio;
  }
  return HIGGSFIELD_SOUL_DEFAULT_ASPECT_RATIO;
}

/** Soul accepts a batch of exactly 1 or 4 — anything else is a 422. */
export function toSoulBatchSize(requested: number | undefined): 1 | 4 {
  return requested && requested > 1 ? 4 : 1;
}

const DOP_ENDPOINTS: ReadonlySet<string> = new Set([
  MODEL_KEYS.HIGGSFIELD_DOP_LITE,
  MODEL_KEYS.HIGGSFIELD_DOP_STANDARD,
  MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
]);

/**
 * Catalog model key → REST endpoint id. The documented DoP submit is
 * `POST /higgsfield-ai/dop/standard`; lite/turbo follow the same path pattern.
 */
export function resolveDopEndpoint(modelKey: string): string | undefined {
  return DOP_ENDPOINTS.has(modelKey) ? modelKey : undefined;
}

/**
 * Older Higgsfield docs spelled the org `higgsfiled`. The catalog key is the
 * corrected endpoint id. A stored typo still dispatches there.
 */
const HIGGSFIELD_GENJUTSU_LEGACY_ENDPOINT =
  'higgsfiled/genjutsu/motion-transfer/v1.0';

export const HIGGSFIELD_GENJUTSU_RESOLUTIONS = [
  '480p',
  '720p',
  '1080p',
] as const;

export const HIGGSFIELD_GENJUTSU_DEFAULT_RESOLUTION = '720p';

export function isGenjutsuModel(modelKey: string): boolean {
  return (
    modelKey === MODEL_KEYS.HIGGSFIELD_GENJUTSU ||
    modelKey === HIGGSFIELD_GENJUTSU_LEGACY_ENDPOINT
  );
}

export function isGenjutsuObjectSwapModel(modelKey: string): boolean {
  return modelKey === MODEL_KEYS.HIGGSFIELD_GENJUTSU_OBJECT_SWAP;
}

export function isGenjutsuRestyleModel(modelKey: string): boolean {
  return modelKey === MODEL_KEYS.HIGGSFIELD_GENJUTSU_RESTYLE;
}

/** Restyle takes at most five optional character stills. */
export const HIGGSFIELD_GENJUTSU_RESTYLE_MAX_IMAGE_URLS = 5;
export const HIGGSFIELD_GENJUTSU_RESTYLE_PRESETS_PATH =
  '/models/higgsfield/genjutsu/restyle/v1.0/presets';

/** Ads Studio renders 1 to 8 concepts per brief. */
export const HIGGSFIELD_ADS_STUDIO_MAX_BATCH_SIZE = 8;
export const HIGGSFIELD_ADS_STUDIO_MAX_IMAGE_URLS = 10;
export const HIGGSFIELD_ADS_STUDIO_MAX_PROMPT_LENGTH = 8_000;
export const HIGGSFIELD_ADS_STUDIO_DEFAULT_ASPECT_RATIO = '1:1';

export function isAdsStudioModel(modelKey: string): boolean {
  return modelKey === MODEL_KEYS.HIGGSFIELD_ADS_STUDIO;
}

/** Ads Studio documented ratio, or the 1:1 default for one it does not list. */
export function toAdsStudioAspectRatio(
  aspectRatio: string | undefined,
): string {
  const supported: readonly string[] = ASPECT_RATIOS.HIGGSFIELD_ADS_STUDIO;
  return aspectRatio && supported.includes(aspectRatio)
    ? aspectRatio
    : HIGGSFIELD_ADS_STUDIO_DEFAULT_ASPECT_RATIO;
}

/** Every Higgsfield endpoint that renders images: the Soul family and Ads Studio. */
export function isHiggsFieldImageModel(modelKey: string): boolean {
  return isHiggsFieldSoulModel(modelKey) || isAdsStudioModel(modelKey);
}

/** Cinema Studio 4.0 documented `resolution` values. */
export const HIGGSFIELD_CINEMA_STUDIO_RESOLUTIONS = ['480p', '720p'] as const;
export const HIGGSFIELD_CINEMA_STUDIO_DEFAULT_RESOLUTION = '720p';
export const HIGGSFIELD_CINEMA_STUDIO_MIN_DURATION_SECONDS = 4;
export const HIGGSFIELD_CINEMA_STUDIO_MAX_DURATION_SECONDS = 30;
export const HIGGSFIELD_CINEMA_STUDIO_DEFAULT_DURATION_SECONDS = 5;
export const HIGGSFIELD_CINEMA_STUDIO_MAX_IMAGE_URLS = 30;
export const HIGGSFIELD_CINEMA_STUDIO_MAX_VIDEO_URLS = 10;
export const HIGGSFIELD_CINEMA_STUDIO_MAX_AUDIO_URLS = 10;

export function isCinemaStudioModel(modelKey: string): boolean {
  return modelKey === MODEL_KEYS.HIGGSFIELD_CINEMA_STUDIO;
}
