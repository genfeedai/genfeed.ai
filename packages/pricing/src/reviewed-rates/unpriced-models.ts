const NO_PUBLIC_RATE =
  'No public per-variant list price was captured (2026-10-06 evidence); it prices from its configured row until `bun run pricing:rates:pull` adds an entry.';
const PRIVATE_DEPLOYMENT =
  'Private managed deployment: no public provider rate exists, so it stays red until an operator-approved rate is set.';
const INPUT_MEGAPIXELS =
  'Bills input and output megapixels; dispatch does not supply input megapixels.';
const IDENTITY_404 =
  'The public provider page returned 404; the model identity is unavailable.';
const FAL_ENDPOINT_GONE =
  'fal no longer serves this endpoint (no OpenAPI document or a redirect, 2026-10-21); the model identity is unavailable.';
const FAL_NO_PUBLIC_RATE =
  'The fal model page publishes no list price (2026-10-21).';
const LEGACY_KEY =
  'Legacy registry key, not a provider endpoint, so no provider page or rate exists.';
const NO_RATE_SHEET_PROVIDER =
  'The rate sheet seeds Replicate, fal, HeyGen and ElevenLabs only; this provider has no public list price to import.';

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
  'bytedance/video-upscaler':
    'The public readme says the price depends on tier, resolution and frame rate, and the numeric table is only on the pricing tab.',
  'fal-ai/clarity-upscaler': FAL_NO_PUBLIC_RATE,
  'fal-ai/eleven-labs-tts': FAL_ENDPOINT_GONE,
  'fal-ai/face-swap': FAL_ENDPOINT_GONE,
  'fal-ai/flux-2-pro': INPUT_MEGAPIXELS,
  'fal-ai/flux-pro': FAL_NO_PUBLIC_RATE,
  'fal-ai/gpt-image-2': FAL_ENDPOINT_GONE,
  'fal-ai/kling-video':
    'A fal model family page, not a callable endpoint, so it has no single price.',
  'fal-ai/kling-video/v3/pro': FAL_ENDPOINT_GONE,
  'fal-ai/luma-dream-machine': FAL_NO_PUBLIC_RATE,
  'fal-ai/pixverse/v6': FAL_ENDPOINT_GONE,
  'fal-ai/recraft/v4/pro': FAL_ENDPOINT_GONE,
  'fal-ai/runway-gen3': FAL_ENDPOINT_GONE,
  'fal-ai/seedance-2.0': FAL_ENDPOINT_GONE,
  'fal-ai/stable-video-diffusion': FAL_ENDPOINT_GONE,
  'fal-ai/topaz/upscale/video':
    'fal prices per second by output resolution band and frame rate; dispatch does not supply the output band.',
  'genfeed-ai/flux-dev': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux-dev-pulid': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid-lora': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid-upscale': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-klein': PRIVATE_DEPLOYMENT,
  'genfeed-ai/z-image-turbo': PRIVATE_DEPLOYMENT,
  'genfeed-ai/z-image-turbo-lora': PRIVATE_DEPLOYMENT,
  'heygen/heygen-video-1':
    'HeyGen publishes no per-video list price for this legacy endpoint; the priced HeyGen avatar engines replace it.',
  'higgsfield-ai/dop/lite': NO_RATE_SHEET_PROVIDER,
  'higgsfield-ai/dop/standard': NO_RATE_SHEET_PROVIDER,
  'higgsfield-ai/dop/turbo': NO_RATE_SHEET_PROVIDER,
  'higgsfield-ai/soul/v2/standard': NO_RATE_SHEET_PROVIDER,
  'higgsfield/genjutsu/motion-transfer/v1.0': NO_RATE_SHEET_PROVIDER,
  'klingai-v2': LEGACY_KEY,
  'kwaivgi/kling-v1.6-pro': IDENTITY_404,
  leonardoai: LEGACY_KEY,
  'meta/meta-llama-3.1-405b-instruct': IDENTITY_404,
  'meta/musicgen': NO_PUBLIC_RATE,
  'mureka/v9':
    'The provider pricing page was unreachable (HTTP 404) when captured.',
  'replicate/fast-flux-trainer':
    'A training job billed on GPU time; Replicate publishes no per-run price.',
  runwayml: LEGACY_KEY,
  sdxl: LEGACY_KEY,
  'x-ai/grok-4.1-fast': IDENTITY_404,
};
