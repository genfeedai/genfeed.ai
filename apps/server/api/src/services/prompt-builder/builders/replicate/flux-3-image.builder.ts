import {
  type Flux3Resolution,
  isFlux3AspectRatio,
  isFlux3Resolution,
} from '@genfeedai/contracts/constants';

export interface Flux3ImageInput extends Record<string, unknown> {
  prompt: string;
  images: string[];
  aspect_ratio: string;
  resolution: Flux3Resolution;
  grounding: false;
  output_format: 'jpg';
  output_quality: 80;
}
export function buildFlux3ImageInput(
  prompt: string,
  images: string[] = [],
  resolution: string = '1k',
  aspectRatio: string = 'auto',
): Flux3ImageInput {
  if (
    !isFlux3Resolution(resolution) ||
    !isFlux3AspectRatio(aspectRatio) ||
    images.length > 10
  )
    throw new Error('Invalid FLUX.3 image controls');
  return {
    prompt,
    images,
    aspect_ratio: aspectRatio,
    resolution,
    grounding: false,
    output_format: 'jpg',
    output_quality: 80,
  };
}
