const NO_PUBLIC_RATE =
  'No public per-variant list price was captured (2026-09-30 evidence); it prices from its configured row until `bun run pricing:rates:pull` adds an entry.';
const FAL_PRICING_API =
  'Fal rates come from the Fal pricing API refresh; no public list price is captured in the sheet.';
const PRIVATE_DEPLOYMENT =
  'Private managed deployment: no public provider rate exists, so it stays red until an operator-approved rate is set.';
const UNMAPPED_VARIANTS =
  'Conditional audio/mode/4K variants are unmapped; needs the pull script.';
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
  'black-forest-labs/flux-schnell': NO_PUBLIC_RATE,
  'bytedance/seedance-2.5':
    'Per-variant video-input rates are not fully published; needs the pull script.',
  'bytedance/seedream-5-pro': NO_PUBLIC_RATE,
  'bytedance/video-upscaler': NO_PUBLIC_RATE,
  'fal-ai/elevenlabs/music': FAL_PRICING_API,
  'fal-ai/lyria3/pro': FAL_PRICING_API,
  'fal/google/gemini-omni-flash': FAL_PRICING_API,
  'fal/minimax/h3-max/director': FAL_PRICING_API,
  'fal/minimax/h3-max/text-to-video': FAL_PRICING_API,
  'genfeed-ai/flux-dev': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux-dev-pulid': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid-lora': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-dev-pulid-upscale': PRIVATE_DEPLOYMENT,
  'genfeed-ai/flux2-klein': PRIVATE_DEPLOYMENT,
  'genfeed-ai/z-image-turbo': PRIVATE_DEPLOYMENT,
  'genfeed-ai/z-image-turbo-lora': PRIVATE_DEPLOYMENT,
  'google/nano-banana-2':
    'Only the 4K rate was captured; other resolutions need the pull script.',
  'google/nano-banana-2-lite': NO_PUBLIC_RATE,
  'ideogram-ai/ideogram-character':
    'The speed selector field name is unverified; needs the pull script.',
  'kwaivgi/kling-v1.6-pro': IDENTITY_404,
  'kwaivgi/kling-v3-omni-video': UNMAPPED_VARIANTS,
  'kwaivgi/kling-v3-video': UNMAPPED_VARIANTS,
  'meta/meta-llama-3.1-405b-instruct': IDENTITY_404,
  'meta/musicgen': NO_PUBLIC_RATE,
  'minimax/h3': NO_PUBLIC_RATE,
  'mureka/v9':
    'The provider pricing page was unreachable (HTTP 404) when captured.',
  'openai/gpt-image-1.5': NO_PUBLIC_RATE,
  'openai/gpt-image-2': NO_PUBLIC_RATE,
  'openai/gpt-image-2.5-flare': NO_PUBLIC_RATE,
  'openai/gpt-image-2.5-sunburst': NO_PUBLIC_RATE,
  'prunaai/p-video': NO_PUBLIC_RATE,
  'topazlabs/image-upscale':
    'Topaz bills provider units whose mapping to an image or megapixel is contradictory on the public page.',
  'topazlabs/video-upscale':
    'Topaz bills provider units that the public page gives only as rough guides.',
  'wan-video/wan-2.2-i2v-fast':
    'The base/interpolate variant has no mapped input field yet.',
  'x-ai/grok-4.1-fast': IDENTITY_404,
};
