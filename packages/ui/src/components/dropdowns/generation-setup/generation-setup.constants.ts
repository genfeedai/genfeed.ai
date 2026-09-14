import type { GenerationSetupLookFieldKey } from '@genfeedai/props/ui/generation-setup/generation-setup.props';

/**
 * Small, self-contained option lists for the Output tab. Deliberately not
 * imported from `packages/pages/studio/generate/utils/studio-generate-settings.ts`
 * (`STUDIO_ASPECT_RATIOS`, `getStudioAspectRatios`) — that would invert the
 * package dependency direction, same reasoning as
 * `GENERATION_SETUP_DEFAULT_ASPECT_RATIO_BY_TYPE` in `generation-setup.recommend.ts`.
 */
export const GENERATION_SETUP_ASPECT_RATIO_OPTIONS: readonly string[] = [
  '1:1',
  '16:9',
  '9:16',
  '4:5',
  '4:3',
  '3:4',
];

export const GENERATION_SETUP_OUTPUTS_OPTIONS: readonly number[] = [1, 2, 3, 4];

export const GENERATION_SETUP_DURATION_OPTIONS_SECONDS: readonly number[] = [
  4, 5, 8, 10,
];

/** Shared between the Look tab and the search index so labels never drift. */
export const GENERATION_SETUP_LOOK_FIELD_LABELS: Record<
  GenerationSetupLookFieldKey,
  string
> = {
  camera: 'Camera',
  cameraMovement: 'Camera movement',
  lens: 'Lens',
  lighting: 'Lighting',
  mood: 'Mood',
  promptTemplate: 'Prompt template',
  resolution: 'Resolution',
  scene: 'Scene',
  style: 'Style',
};

export const GENERATION_SETUP_LOOK_FIELD_ORDER: readonly GenerationSetupLookFieldKey[] =
  [
    'style',
    'mood',
    'scene',
    'camera',
    'cameraMovement',
    'lens',
    'lighting',
    'resolution',
    'promptTemplate',
  ];
