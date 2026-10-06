const NO_PUBLIC_RATE =
  'No public per-variant list price was captured (2026-10-06 evidence); it prices from its configured row until `bun run pricing:rates:pull` adds an entry.';
const PRIVATE_DEPLOYMENT =
  'Private managed deployment: no public provider rate exists, so it stays red until an operator-approved rate is set.';
const INPUT_MEGAPIXELS =
  'Bills input and output megapixels; dispatch does not supply input megapixels.';
const IDENTITY_404 =
  'The public provider page returned 404; the model identity is unavailable.';

/**
 * Models that deliberately have no rate-sheet entry, with the reason. A paid
 * catalog model needs a sheet entry or a line here (checked in CI).
 */
export const UNPRICED_MODELS: Readonly<Record<string, string>> = {
  'black-forest-labs/flux-2-dev': INPUT_MEGAPIXELS,
  'black-forest-labs/flux-2-flex': INPUT_MEGAPIXELS,
  'bytedance/video-upscaler':
    'The public readme says the price depends on tier, resolution and frame rate, and the numeric table is only on the pricing tab.',
  'genfeed-ai/flux-dev': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux-dev-pulid': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid-lora': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid-upscale': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-klein': PRIVATE_DEPLOYMENT,
  'genfeed-ai/z-image-turbo': PRIVATE_DEPLOYMENT,
  'genfeed-ai/z-image-turbo-lora': PRIVATE_DEPLOYMENT,
  'kwaivgi/kling-v1.6-pro': IDENTITY_404,
  'meta/meta-llama-3.1-405b-instruct': IDENTITY_404,
  'meta/musicgen': NO_PUBLIC_RATE,
  'mureka/v9':
    'The provider pricing page was unreachable (HTTP 404) when captured.',
  'topazlabs/image-upscale':
    'Topaz bills provider units whose mapping to an image or megapixel is contradictory on the public page.',
  'topazlabs/video-upscale':
    'Topaz bills provider units that the public page gives only as rough guides.',
  'x-ai/grok-4.1-fast': IDENTITY_404,
};
