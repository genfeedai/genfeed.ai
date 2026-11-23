import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';

const TEXT_ENDPOINT = 'minimax-h3/text-to-video';
const IMAGE_ENDPOINT = 'minimax-h3/image-to-video';

const REFERENCE_FIELDS = [
  'reference_audio_urls',
  'reference_image_urls',
  'reference_video_urls',
] as const;

function hasValue(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isEmptyList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

/**
 * Translate a Replicate `minimax/h3` request for one kie endpoint.
 *
 * kie serves H3 as three endpoints; the text and image-to-video ones are
 * offers (reviewed against kie's OpenAPI and Replicate's schema, 2026-11-23).
 * Returns `undefined` when the endpoint is not an H3 offer (the generic mapper
 * applies), `null` when this endpoint cannot serve the request, and the
 * adapted request otherwise. Reference images, videos and audio are refused:
 * kie bills reference seconds and images past the fifth, which the reviewed
 * rates do not cover, so those requests stay on Replicate.
 */
export function adaptKieMinimaxH3Request(
  endpoint: string | null | undefined,
  request: ModelCreditQuoteInput,
): ModelCreditQuoteInput | null | undefined {
  if (endpoint !== TEXT_ENDPOINT && endpoint !== IMAGE_ENDPOINT)
    return undefined;
  // Without the native input the start frame is unknown.
  if (!request.providerInput) return null;

  const native: Record<string, unknown> = { ...request.providerInput };
  if (!REFERENCE_FIELDS.every((field) => isEmptyList(native[field])))
    return null;
  for (const field of REFERENCE_FIELDS) delete native[field];

  const hasFirst = hasValue(native.first_frame_image);
  const hasLast = hasValue(native.last_frame_image);
  const isImageStart = hasFirst || hasLast;
  if (isImageStart !== (endpoint === IMAGE_ENDPOINT)) return null;

  const ratio = native.ratio;
  delete native.ratio;
  if (endpoint === TEXT_ENDPOINT) {
    // kie's text endpoint has no `adaptive`; Replicate only uses it with a frame.
    if (typeof ratio !== 'string' || ratio === 'adaptive') return null;
    native.aspect_ratio = ratio;
  }

  // Keep absent frames out of the input rather than sending null.
  if (native.first_frame_image !== undefined) {
    native.first_frame_url = native.first_frame_image;
    delete native.first_frame_image;
  }
  if (native.last_frame_image !== undefined) {
    native.last_frame_url = native.last_frame_image;
    delete native.last_frame_image;
  }
  for (const key of ['first_frame_url', 'last_frame_url'])
    if (native[key] === null) delete native[key];

  return { ...request, providerInput: native };
}
