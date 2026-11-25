const NO_PUBLIC_RATE =
  'No public per-variant list price was captured (2026-10-06 evidence); it prices from its configured row until `bun run pricing:rates:pull` adds an entry.';
const INPUT_MEGAPIXELS =
  'Bills input and output megapixels; dispatch does not supply input megapixels.';
const IDENTITY_404 =
  'The public provider page returned 404; the model identity is unavailable.';
const FAL_ENDPOINT_GONE =
  'fal no longer serves this endpoint (no OpenAPI document or a redirect, 2026-10-21); the model identity is unavailable.';
const FAL_ENDPOINT_MOVED =
  'fal serves this model under a new endpoint id (checked 2026-11-01); it has no reviewed rate until the fal price refresh reads one for the new id and an operator approves it.';
const FAL_NO_PUBLIC_RATE =
  'The fal model page publishes no list price (2026-10-21).';
const LEGACY_KEY =
  'Legacy registry key, not a provider endpoint, so no provider page or rate exists.';
const RANGE_CRITERION =
  'Replicate prices it with a range criterion the importer cannot map yet (2026-10-27).';
const UNMAPPED_METRIC =
  'Replicate bills it on a metric the importer cannot map yet (2026-10-27).';
const TIER_WITHOUT_PRICE =
  'Replicate lists a billing tier without a price (2026-10-27).';
const HIGGSFIELD_DOP_NOT_LISTED =
  'Higgsfield no longer lists this DoP endpoint in its docs catalog (checked 2026-11-15), so no estimate can price it; retire it unless Higgsfield confirms it still answers.';
const HIGGSFIELD_ESTIMATE_PENDING =
  'Higgsfield publishes no price page; its own estimate for this endpoint has not been sampled yet, so it has no reviewed rate (2026-11-16).';
/**
 * Models that deliberately have no rate-sheet entry, with the reason. A paid,
 * non-retired catalog model needs a sheet entry or a line here (checked in CI).
 * An inactive model listed here is not flagged as needing a price.
 */
export const UNPRICED_MODELS: Readonly<Record<string, string>> = {
  'argil/atom': IDENTITY_404,
  'baai/bge-large-en-v1.5': IDENTITY_404,
  'black-forest-labs/flux-2-dev': INPUT_MEGAPIXELS,
  'black-forest-labs/flux-2-flex': INPUT_MEGAPIXELS,
  'black-forest-labs/flux-2-klein-4b': INPUT_MEGAPIXELS,
  'black-forest-labs/flux-2-max': INPUT_MEGAPIXELS,
  'black-forest-labs/flux-2-pro': INPUT_MEGAPIXELS,
  'fal-ai/clarity-upscaler': FAL_NO_PUBLIC_RATE,
  'fal-ai/eleven-labs-tts': FAL_ENDPOINT_MOVED,
  'fal-ai/face-swap': FAL_ENDPOINT_GONE,
  'fal-ai/flux-2-pro': INPUT_MEGAPIXELS,
  'fal-ai/flux-pro': FAL_NO_PUBLIC_RATE,
  'fal-ai/gpt-image-2': FAL_ENDPOINT_MOVED,
  'fal-ai/kling-video':
    'A fal model family page, not a callable endpoint, so it has no single price.',
  'fal-ai/luma-dream-machine': FAL_NO_PUBLIC_RATE,
  'fal-ai/runway-gen3': FAL_ENDPOINT_GONE,
  'fal-ai/seedance-2.0': FAL_ENDPOINT_MOVED,
  'fal-ai/stable-video-diffusion': FAL_ENDPOINT_GONE,
  'fal-ai/topaz/upscale/video':
    'fal prices per second by output resolution band and frame rate; dispatch does not supply the output band.',
  'heygen/heygen-video-1':
    'HeyGen publishes no per-video list price for its own v3 route (docs read 2026-11-24). HeyGen Video 1 runs through fal at its published rate, as fal/heygen/heygen-video/text-to-video.',
  'higgsfield-ai/dop/lite': HIGGSFIELD_DOP_NOT_LISTED,
  'higgsfield-ai/dop/standard': HIGGSFIELD_DOP_NOT_LISTED,
  'higgsfield-ai/dop/turbo': HIGGSFIELD_DOP_NOT_LISTED,
  'higgsfield/cinema-studio/4.0':
    'Metered in provider tokens from request parameters; the reconciled rate lands with the Higgsfield pricing work.',
  'higgsfield/ads-studio/v1.0':
    'Metered per image in provider tokens (text, image input and image output rates differ); the reconciled rate lands with the Higgsfield pricing work.',
  'higgsfield/genjutsu/object-swap/v1.0': HIGGSFIELD_ESTIMATE_PENDING,
  'higgsfield/genjutsu/restyle/v1.0': HIGGSFIELD_ESTIMATE_PENDING,
  'higgsfield-ai/soul/cinema': HIGGSFIELD_ESTIMATE_PENDING,
  'higgsfield-ai/soul/standard': HIGGSFIELD_ESTIMATE_PENDING,
  'klingai-v2': LEGACY_KEY,
  'kwaivgi/kling-v1.6-pro': IDENTITY_404,
  leonardoai: LEGACY_KEY,
  'meta/meta-llama-3.1-405b-instruct': IDENTITY_404,
  'meta/musicgen': NO_PUBLIC_RATE,
  'mureka/v9':
    'The provider pricing page was unreachable (HTTP 404) when captured.',
  'google/gemini-3.1-pro': RANGE_CRITERION,
  'luma/modify-video': UNMAPPED_METRIC,
  'openai/gpt-image-1-mini': TIER_WITHOUT_PRICE,
  'prunaai/p-image-trainer': UNMAPPED_METRIC,
  'prunaai/z-image-turbo':
    'Replicate prices it per output megapixel by a target resolution the model does not take (width and height are the inputs), and the 0.5 and 1 tiers list inconsistent prices (2026-10-27).',
  'replicate/fast-flux-trainer':
    'A training job billed on GPU time; Replicate publishes no per-run price.',
  runwayml: LEGACY_KEY,
  sdxl: LEGACY_KEY,
  'x-ai/grok-4.1-fast': IDENTITY_404,
};

/**
 * Registry rows whose provider says nothing can be refreshed because the
 * provider no longer serves the endpoint (404 or gone). The scanner stays
 * quiet about them: the reason is already recorded above.
 */
export function isKnownUnavailableModel(modelKey: string): boolean {
  const reason = Object.getOwnPropertyDescriptor(
    UNPRICED_MODELS,
    modelKey,
  )?.value;
  return reason === IDENTITY_404 || reason === FAL_ENDPOINT_GONE;
}

/**
 * Rows stored under a provider that never hosted the endpoint. The row is
 * wrong, not the provider: the scanner reports each once as a data error
 * instead of asking the provider about it every run.
 */
export const PROVIDER_ENDPOINT_DATA_ERRORS: Readonly<Record<string, string>> = {
  'argil/atom':
    'Stored under Replicate, but argil/atom is not a Replicate model (the page and the API both return 404).',
  'baai/bge-large-en-v1.5':
    'Stored under Replicate, but baai/bge-large-en-v1.5 is not a Replicate model (the page and the API both return 404).',
  'fal-ai/runway-gen3':
    'Stored under fal, but fal no longer serves fal-ai/runway-gen3 (checked 2026-10-21).',
};
