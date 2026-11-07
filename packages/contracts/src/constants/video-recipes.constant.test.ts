import { describe, expect, it } from 'vitest';
import {
  type VideoRecipeStep,
  videoRecipeSchema,
} from '../api-types/contracts/video-recipe.contract';
import { ModelCategory } from '../enums/model.enum';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import { MODEL_KEYS } from './model-keys.constant';
import {
  findUnmetVideoRecipeRequirements,
  getVideoRecipe,
  REALISTIC_VIDEO_RECIPE,
} from './video-recipes.constant';

const FINAL_VIDEO: VideoRecipeStep = {
  category: ModelCategory.VIDEO,
  id: 'final-video',
  isReviewPoint: false,
  label: 'Final video',
  minReferences: 3,
  minVideoReferences: 1,
  requiredFlags: [],
};

const INTERPOLATED_VIDEO: VideoRecipeStep = {
  ...FINAL_VIDEO,
  id: 'interpolated-video',
  minVideoReferences: 0,
  requiredFlags: ['hasEndFrame', 'hasNativeExtend'],
};

const SHOT_LIST: VideoRecipeStep = {
  category: ModelCategory.TEXT,
  id: 'shot-list',
  isReviewPoint: true,
  label: 'Shot list',
  minReferences: 0,
  minVideoReferences: 0,
  requiredFlags: [],
};

describe('findUnmetVideoRecipeRequirements', () => {
  it.each([
    {
      expected: [],
      key: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      name: 'Seedance 2.5 takes video references',
    },
    {
      expected: ['at least 1 video references'],
      key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
      name: 'Veo 3.1 takes no video references',
    },
  ])('$name', ({ key, expected }) => {
    expect(
      findUnmetVideoRecipeRequirements(
        FINAL_VIDEO,
        MODEL_OUTPUT_CAPABILITIES[key],
      ),
    ).toEqual(expected);
  });

  it('names each missing capability flag', () => {
    expect(
      findUnmetVideoRecipeRequirements(
        INTERPOLATED_VIDEO,
        MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1],
      ),
    ).toEqual(['native extend']);
  });

  it('refuses a model with unknown capabilities when the step has requirements', () => {
    expect(findUnmetVideoRecipeRequirements(FINAL_VIDEO, null)).toEqual([
      'capabilities unknown',
    ]);
  });

  it('accepts any model for a step without requirements', () => {
    expect(findUnmetVideoRecipeRequirements(SHOT_LIST, null)).toEqual([]);
  });
});

describe('REALISTIC_VIDEO_RECIPE', () => {
  it('is found by its key', () => {
    expect(getVideoRecipe('realistic-video')).toBe(REALISTIC_VIDEO_RECIPE);
  });

  it('names no model anywhere, only categories and capabilities', () => {
    expect(JSON.stringify(REALISTIC_VIDEO_RECIPE)).not.toMatch(
      /seedance|veo|gpt-image|seedream|kling|flux/i,
    );
  });

  it('rejects duplicate step ids', () => {
    expect(
      videoRecipeSchema.safeParse({
        ...REALISTIC_VIDEO_RECIPE,
        steps: [SHOT_LIST, SHOT_LIST],
      }).success,
    ).toBe(false);
  });
});
