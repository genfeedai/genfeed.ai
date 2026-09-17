import { MODEL_KEYS } from '@genfeedai/contracts/constants';

/**
 * Endpoint paths on the Higgsfield platform API (v2). Verified against the
 * official SDK's `EndpointInputMap` — the platform routes by path, not by a
 * `model` field, so every catalog row below names the path it posts to.
 *
 * @see https://github.com/higgsfield-ai/higgsfield-js `src/v2/types.ts`
 */
/**
 * Overridable with `HIGGSFIELD_API_BASE_URL` so a host change is configuration
 * rather than a code change.
 */
export const HIGGSFIELD_DEFAULT_BASE_URL = 'https://platform.higgsfield.ai';

export const HIGGSFIELD_ENDPOINTS = {
  DOP_IMAGE_TO_VIDEO: '/v1/image2video/dop',
  SOUL_TEXT_TO_IMAGE: '/v1/text2image/soul',
  SPEAK_VIDEO: '/v1/speak/higgsfield',
} as const;

export type HiggsFieldEndpoint =
  (typeof HIGGSFIELD_ENDPOINTS)[keyof typeof HIGGSFIELD_ENDPOINTS];

/** DoP quality tiers, sent as the `model` field of `/v1/image2video/dop`. */
export const HIGGSFIELD_DOP_VARIANTS = {
  LITE: 'dop-lite',
  STANDARD: 'dop-standard',
  TURBO: 'dop-turbo',
} as const;

export type HiggsFieldDopVariant =
  (typeof HIGGSFIELD_DOP_VARIANTS)[keyof typeof HIGGSFIELD_DOP_VARIANTS];

/**
 * Catalog model key → DoP variant. Adding a tier is a row here plus the
 * matching `MODEL_KEYS` / capability entries; the service itself stays generic.
 */
export const HIGGSFIELD_DOP_MODELS: Readonly<
  Record<string, HiggsFieldDopVariant>
> = {
  [MODEL_KEYS.HIGGSFIELD_DOP_LITE]: HIGGSFIELD_DOP_VARIANTS.LITE,
  [MODEL_KEYS.HIGGSFIELD_DOP_STANDARD]: HIGGSFIELD_DOP_VARIANTS.STANDARD,
  [MODEL_KEYS.HIGGSFIELD_DOP_TURBO]: HIGGSFIELD_DOP_VARIANTS.TURBO,
};

/**
 * Returns the DoP tier a catalog model key selects, or `undefined` when the key
 * is not a DoP model — which is how the video adapter decides what it supports.
 */
export function resolveDopVariant(
  modelKey: string,
): HiggsFieldDopVariant | undefined {
  return HIGGSFIELD_DOP_MODELS[modelKey];
}

/** Soul renders fixed sizes only, so an aspect ratio has to be snapped to one. */
export const HIGGSFIELD_SOUL_SIZES = {
  '1:1': '1536x1536',
  '3:4': '1536x2048',
  '4:3': '2048x1536',
  '9:16': '1152x2048',
  '16:9': '2048x1152',
} as const;

export const HIGGSFIELD_SOUL_DEFAULT_SIZE = HIGGSFIELD_SOUL_SIZES['1:1'];

export type HiggsFieldSoulQuality = '720p' | '1080p';

/**
 * Maps a catalog aspect ratio onto one of Soul's supported `width_and_height`
 * values. Unknown ratios fall back to square rather than failing the job —
 * the platform rejects any value outside its fixed list with a 422.
 */
export function toSoulSize(aspectRatio: string | undefined): string {
  if (!aspectRatio) {
    return HIGGSFIELD_SOUL_DEFAULT_SIZE;
  }
  return (
    HIGGSFIELD_SOUL_SIZES[aspectRatio as keyof typeof HIGGSFIELD_SOUL_SIZES] ??
    HIGGSFIELD_SOUL_DEFAULT_SIZE
  );
}

/** Soul accepts a batch of exactly 1 or 4 — anything else is a 422. */
export function toSoulBatchSize(requested: number | undefined): 1 | 4 {
  return requested && requested > 1 ? 4 : 1;
}
