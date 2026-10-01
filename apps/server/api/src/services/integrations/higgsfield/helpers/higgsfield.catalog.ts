import { MODEL_KEYS } from '@genfeedai/contracts/constants';

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

/** Soul 2 documented `aspect_ratio` values. Unknown ratios snap to the default. */
export const HIGGSFIELD_SOUL_ASPECT_RATIOS = [
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

export const HIGGSFIELD_SOUL_DEFAULT_ASPECT_RATIO: HiggsFieldSoulAspectRatio =
  '4:3';

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
export const HIGGSFIELD_GENJUTSU_LEGACY_ENDPOINT =
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
