import { ASPECT_RATIOS } from './model-aspect-ratios.constant';
import { MODEL_KEYS } from './model-keys.constant';

export const FLUX_2_KLEIN_OUTPUT_MEGAPIXELS = [
  '0.25',
  '0.5',
  '1',
  '2',
  '4',
] as const;
export type Flux2KleinOutputMegapixels =
  (typeof FLUX_2_KLEIN_OUTPUT_MEGAPIXELS)[number];
export type Flux2KleinAspectRatio = (typeof ASPECT_RATIOS.FLUX_2_KLEIN)[number];

export function isFlux2KleinOutputMegapixels(
  value: unknown,
): value is Flux2KleinOutputMegapixels {
  return FLUX_2_KLEIN_OUTPUT_MEGAPIXELS.some((option) => option === value);
}

export function isFlux2KleinAspectRatio(
  value: unknown,
): value is Flux2KleinAspectRatio {
  return ASPECT_RATIOS.FLUX_2_KLEIN.some((option) => option === value);
}

/**
 * Shared draft generation settings (#6738). Drafts are black-and-white
 * storyboard sketches: cheap to retry, and they keep attention on
 * composition. The style is fixed on the server, so a brand's colour or look
 * settings never reach a draft prompt.
 */
export const DRAFT_GENERATION_CONFIG = {
  draftModelKey: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_KLEIN_4B,
  maxReferences: 5,
  outputMegapixels: '1' satisfies Flux2KleinOutputMegapixels,
  sketchStyle:
    'Black-and-white storyboard pencil sketch, clean line art, grey shading, no colour, no text, no watermark.',
} as const;
