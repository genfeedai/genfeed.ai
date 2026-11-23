import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';

const ENDPOINT = 'bytedance/seedance-2-fast';

const REFERENCE_FIELDS = [
  'reference_audios',
  'reference_images',
  'reference_videos',
] as const;

function isEmptyList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

/**
 * Translate a Replicate `bytedance/seedance-2.0-fast` request for kie's
 * Seedance 2.0 Fast endpoint.
 *
 * Reviewed against kie's OpenAPI and Replicate's schema (2026-11-23). Returns
 * `undefined` when the endpoint is not this offer (the generic mapper
 * applies), `null` when kie cannot serve the request, and the adapted request
 * otherwise. Reference images, videos and audio are refused: kie bills
 * reference video seconds, which the reviewed rates do not model. kie has no
 * seed, so a seeded request stays on Replicate to keep it reproducible.
 */
export function adaptKieSeedanceFastRequest(
  endpoint: string | null | undefined,
  request: ModelCreditQuoteInput,
): ModelCreditQuoteInput | null | undefined {
  if (endpoint !== ENDPOINT) return undefined;
  if (!request.providerInput) return null;

  const native: Record<string, unknown> = { ...request.providerInput };
  if (!REFERENCE_FIELDS.every((field) => isEmptyList(native[field])))
    return null;
  for (const field of REFERENCE_FIELDS) delete native[field];
  if (native.seed !== undefined && native.seed !== null) return null;
  delete native.seed;

  // The Replicate builder sends `last_frame`; its schema calls it `last_frame_image`.
  const lastFrame = native.last_frame_image ?? native.last_frame;
  delete native.last_frame_image;
  delete native.last_frame;
  const firstFrame =
    typeof native.image === 'string' && native.image ? native.image : undefined;
  delete native.image;
  if (typeof lastFrame === 'string' && lastFrame) {
    // Both providers animate between frames, so an end frame needs a start.
    if (!firstFrame) return null;
    native.last_frame_url = lastFrame;
  }
  if (firstFrame) native.first_frame_url = firstFrame;

  return { ...request, providerInput: native };
}
