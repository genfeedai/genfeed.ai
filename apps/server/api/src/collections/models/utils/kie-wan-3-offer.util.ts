import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';

const ENDPOINT = 'wan/3-0-video';

/**
 * Translate a Replicate `alibaba/wan-3` request for kie's Wan 3.0 endpoint.
 *
 * Reviewed against kie's OpenAPI and Replicate's schema (2026-11-23). Returns
 * `undefined` when the endpoint is not this offer (the generic mapper
 * applies), `null` when kie cannot serve the request, and the adapted request
 * otherwise. kie has no negative prompt and no prompt-expansion switch, so a
 * request that sets either stays on Replicate; kie's other fields are the
 * same, and the resolution is upper-cased (`1080p` is kie's `1080P`).
 */
export function adaptKieWan3Request(
  endpoint: string | null | undefined,
  request: ModelCreditQuoteInput,
): ModelCreditQuoteInput | null | undefined {
  if (endpoint !== ENDPOINT) return undefined;
  // Without the native input the start image is unknown.
  if (!request.providerInput) return null;

  const native: Record<string, unknown> = { ...request.providerInput };
  if (typeof native.negative_prompt === 'string' && native.negative_prompt)
    return null;
  delete native.negative_prompt;
  if (native.enable_prompt_expansion === false) return null;
  delete native.enable_prompt_expansion;

  const resolution = native.resolution ?? request.selectors?.resolution;
  if (resolution !== undefined) {
    if (typeof resolution !== 'string') return null;
    native.resolution = resolution.toUpperCase();
  }

  if (typeof native.image === 'string' && native.image) {
    native.first_frame_url = native.image;
    // Replicate ignores the ratio next to an image; kie adapts to the frame.
    delete native.aspect_ratio;
  }
  delete native.image;

  return { ...request, providerInput: native };
}
