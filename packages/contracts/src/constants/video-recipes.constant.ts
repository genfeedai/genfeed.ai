import {
  type VideoRecipe,
  type VideoRecipeStep,
  videoRecipeSchema,
} from '../api-types/contracts/video-recipe.contract';
import { ModelCategory } from '../enums/model.enum';
import type { ModelOutputCapability } from './model-capabilities.constant';

function step(
  input: Pick<VideoRecipeStep, 'id' | 'label' | 'category'> &
    Partial<VideoRecipeStep>,
): VideoRecipeStep {
  return {
    isReviewPoint: false,
    minReferences: 0,
    minVideoReferences: 0,
    requiredFlags: [],
    ...input,
  };
}

/**
 * Realistic video (#9614): build an asset bible first, compile a timestamped
 * prompt, iterate on a draft, then render the final clip with the blocking
 * animatic as a motion reference. Steps name what a model must do, never
 * which model does it.
 */
export const REALISTIC_VIDEO_RECIPE: VideoRecipe = videoRecipeSchema.parse({
  key: 'realistic-video',
  version: 1,
  label: 'Realistic video',
  description:
    'Asset bible, timestamped shot list, draft then final render guided by a 3D blocking animatic, coded overlays and assembly.',
  steps: [
    step({
      id: 'shot-list',
      label: 'Shot list',
      category: ModelCategory.TEXT,
      isReviewPoint: true,
    }),
    step({
      id: 'character-design',
      label: 'Character design',
      category: ModelCategory.IMAGE,
    }),
    step({
      id: 'character-realism',
      label: 'Face and costume',
      category: ModelCategory.IMAGE_EDIT,
      minReferences: 2,
    }),
    step({ id: 'props', label: 'Props', category: ModelCategory.IMAGE }),
    step({
      id: 'environment',
      label: 'Environment',
      category: ModelCategory.IMAGE,
      minReferences: 1,
    }),
    step({
      id: 'environment-edit',
      label: 'Environment edit',
      category: ModelCategory.IMAGE_EDIT,
      minReferences: 1,
      isReviewPoint: true,
    }),
    step({
      id: 'prompt-compile',
      label: 'Prompt compile',
      category: ModelCategory.TEXT,
    }),
    step({
      id: 'blocking',
      label: '3D blocking',
      category: ModelCategory.TEXT,
      isReviewPoint: true,
    }),
    step({
      id: 'draft-video',
      label: 'Draft video',
      category: ModelCategory.VIDEO,
      minReferences: 3,
      isReviewPoint: true,
    }),
    step({
      id: 'final-video',
      label: 'Final video',
      category: ModelCategory.VIDEO,
      minReferences: 3,
      minVideoReferences: 1,
    }),
    step({
      id: 'overlay',
      label: 'Coded overlays',
      category: ModelCategory.TEXT,
    }),
    step({ id: 'music', label: 'Music', category: ModelCategory.MUSIC }),
  ],
});

export const VIDEO_RECIPES: readonly VideoRecipe[] = [REALISTIC_VIDEO_RECIPE];

export function getVideoRecipe(key: string): VideoRecipe | undefined {
  return VIDEO_RECIPES.find((recipe) => recipe.key === key);
}

const CAPABILITY_FLAG_LABELS: Readonly<
  Record<VideoRecipeStep['requiredFlags'][number], string>
> = {
  hasEndFrame: 'an end frame',
  hasInterpolation: 'frame interpolation',
  hasNativeExtend: 'native extend',
  hasResolutionOptions: 'resolution options',
  hasSpeech: 'native audio',
  hasVideoReferences: 'video references',
};

/**
 * What a model is missing for a step, as readable reasons. Empty means the
 * model can run the step. A step with no requirements accepts any model in
 * its category; a step with requirements refuses a model whose capabilities
 * are unknown rather than guessing.
 */
export function findUnmetVideoRecipeRequirements(
  recipeStep: VideoRecipeStep,
  capability: ModelOutputCapability | null,
): string[] {
  const hasRequirements =
    recipeStep.requiredFlags.length > 0 ||
    recipeStep.minReferences > 0 ||
    recipeStep.minVideoReferences > 0;
  if (!hasRequirements) return [];
  if (!capability || capability.category !== recipeStep.category) {
    return ['capabilities unknown'];
  }

  const flags = capability as Partial<
    Record<VideoRecipeStep['requiredFlags'][number], boolean>
  >;
  const videoReferences =
    'maxVideoReferences' in capability
      ? (capability.maxVideoReferences ?? 0)
      : 0;
  return [
    ...recipeStep.requiredFlags
      .filter((flag) => flags[flag] !== true)
      .map((flag) => CAPABILITY_FLAG_LABELS[flag]),
    ...(capability.maxReferences < recipeStep.minReferences
      ? [`at least ${recipeStep.minReferences} image references`]
      : []),
    ...(videoReferences < recipeStep.minVideoReferences
      ? [`at least ${recipeStep.minVideoReferences} video references`]
      : []),
  ];
}
