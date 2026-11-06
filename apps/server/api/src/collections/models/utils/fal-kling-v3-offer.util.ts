import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';

type KlingTier = 'pro' | 'standard';

interface FalKlingV3Offer {
  readonly isImageToVideo: boolean;
  readonly tier: KlingTier;
}

/**
 * The fal endpoints that serve Replicate's `kwaivgi/kling-v3-video`, keyed
 * by endpoint. Reviewed equivalence (fal OpenAPI and Replicate schema,
 * 2026-11-04), never inferred from the endpoint name.
 */
const FAL_KLING_V3_OFFERS: Readonly<Record<string, FalKlingV3Offer>> = {
  'fal-ai/kling-video/v3/pro/image-to-video': {
    isImageToVideo: true,
    tier: 'pro',
  },
  'fal-ai/kling-video/v3/pro/text-to-video': {
    isImageToVideo: false,
    tier: 'pro',
  },
  'fal-ai/kling-video/v3/standard/image-to-video': {
    isImageToVideo: true,
    tier: 'standard',
  },
  'fal-ai/kling-video/v3/standard/text-to-video': {
    isImageToVideo: false,
    tier: 'standard',
  },
};

/** Replicate's default when a request names no mode. */
const REPLICATE_DEFAULT_MODE = 'pro';

/**
 * Replicate fields with no fal counterpart on these endpoints. fal's
 * `multi_prompt` is an array where Replicate's is a string, and voice ids
 * would bill fal's voice-control rate, which no offer is priced for.
 */
const UNSUPPORTED_FIELDS = ['multi_prompt', 'voice_ids'] as const;

function hasImage(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Translate a Replicate Kling v3 request for one fal endpoint.
 *
 * Returns `undefined` when the endpoint is not a Kling v3 offer (the generic
 * mapper applies), `null` when this endpoint cannot serve the request (wrong
 * tier, text vs image start, or a feature fal lacks), and the adapted request
 * otherwise. The caller maps the image keys (`start_image` to
 * `start_image_url`, `end_image` to `end_image_url`) through its aliases.
 */
export function adaptFalKlingV3Request(
  endpoint: string | null | undefined,
  request: ModelCreditQuoteInput,
): ModelCreditQuoteInput | null | undefined {
  const offer = endpoint ? FAL_KLING_V3_OFFERS[endpoint] : undefined;
  if (!offer) return undefined;
  // Without the native input the tier and start image are unknown.
  if (!request.providerInput) return null;

  const native: Record<string, unknown> = { ...request.providerInput };
  if (UNSUPPORTED_FIELDS.some((field) => native[field] !== undefined))
    return null;

  const mode = native.mode ?? REPLICATE_DEFAULT_MODE;
  if (mode !== offer.tier) return null;
  delete native.mode;

  const hasStartImage = hasImage(native.start_image);
  // Replicate refuses an end frame without a start frame too.
  if (hasImage(native.end_image) && !hasStartImage) return null;
  if (hasStartImage !== offer.isImageToVideo) return null;

  // fal takes the duration as a string enum ("3" to "15").
  const duration = native.duration ?? request.duration;
  if (typeof duration === 'number') native.duration = String(duration);

  // fal's image endpoints have no aspect ratio; Replicate ignores it when a
  // start image is given, so dropping it changes nothing.
  if (offer.isImageToVideo) delete native.aspect_ratio;

  // fal defaults audio on and adds its own negative prompt; Replicate
  // defaults to no audio and an empty negative prompt. Pin Replicate's so an
  // unset field neither adds audio nor bills the audio rate.
  if (native.generate_audio === undefined)
    native.generate_audio =
      typeof request.selectors?.generate_audio === 'boolean'
        ? request.selectors.generate_audio
        : false;
  if (native.negative_prompt === undefined) native.negative_prompt = '';

  return { ...request, providerInput: native };
}
