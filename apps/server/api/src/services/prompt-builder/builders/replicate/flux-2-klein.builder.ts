import {
  DRAFT_GENERATION_CONFIG,
  type Flux2KleinAspectRatio,
  type Flux2KleinOutputMegapixels,
  isFlux2KleinAspectRatio,
  isFlux2KleinOutputMegapixels,
} from '@genfeedai/contracts/constants';

export interface Flux2KleinInput extends Record<string, unknown> {
  prompt: string;
  images: string[];
  aspect_ratio: Flux2KleinAspectRatio;
  output_megapixels: Flux2KleinOutputMegapixels;
  output_format: 'jpg';
  output_quality: 90;
  seed?: number;
}

/** Replicate `black-forest-labs/flux-2-klein-4b`: up to five `images`, one output. */
export function buildFlux2KleinInput(
  prompt: string,
  images: string[] = [],
  aspectRatio?: string,
  outputMegapixels?: string,
  seed?: number,
): Flux2KleinInput {
  const ratio = aspectRatio ?? (images.length ? 'match_input_image' : '1:1');
  if (
    !isFlux2KleinAspectRatio(ratio) ||
    images.length > DRAFT_GENERATION_CONFIG.maxReferences
  )
    throw new Error('Invalid FLUX.2 klein controls');
  return {
    prompt,
    images,
    aspect_ratio: ratio,
    // Studio resolution labels such as "1K" are not megapixel options.
    output_megapixels: isFlux2KleinOutputMegapixels(outputMegapixels)
      ? outputMegapixels
      : DRAFT_GENERATION_CONFIG.outputMegapixels,
    output_format: 'jpg',
    output_quality: 90,
    ...(seed === undefined ? {} : { seed }),
  };
}
