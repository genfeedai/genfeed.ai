import { MODEL_KEYS } from './model-keys.constant';

/** Replicate public schema and prices verified 2026-10-01. */
export const FLUX_3_RESOLUTIONS = ['768sq', '1k', '1.5k', '2k', '4k'] as const;
export type Flux3Resolution = (typeof FLUX_3_RESOLUTIONS)[number];
export const FLUX_3_ASPECT_RATIOS = [
  'auto',
  '21:9',
  '2:1',
  '16:9',
  '3:2',
  '7:5',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '5:7',
  '2:3',
  '9:16',
  '1:2',
  '9:21',
] as const;
export const FLUX_3_PROVIDER_COSTS: Record<Flux3Resolution, number> = {
  '768sq': 0.0205,
  '1k': 0.024,
  '1.5k': 0.035,
  '2k': 0.05,
  '4k': 0.3035,
};
export const FLUX_3_IMAGE_CONTRACT_VERSION = 'flux-3-image-2026-10-01';
export const FLUX_3_EDIT_CONTRACT_VERSION = 'flux-3-image-edit-2026-10-01';
export function isFlux3ImageModel(model: string): boolean {
  return (
    model === MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE ||
    model === MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT
  );
}
export function isFlux3Resolution(value: unknown): value is Flux3Resolution {
  return (
    typeof value === 'string' &&
    FLUX_3_RESOLUTIONS.some((resolution) => resolution === value)
  );
}
export function isFlux3AspectRatio(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    FLUX_3_ASPECT_RATIOS.some((ratio) => ratio === value)
  );
}
export function getImageEditMaxSources(model?: string): number {
  return model === MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT
    ? 10
    : 5;
}
