import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateJob } from '@pages/studio/generate/types';
import { describe, expect, it } from 'vitest';
import { buildRepromptData } from './generation-payloads';
import {
  formatStudioRecipePrompt,
  groupStudioGenerateJobsByRun,
  recipeFromPromptData,
  recipeFromRepromptData,
  resolveAspectRatioFromDimensions,
  resolveRecipeForJob,
  settingsPatchFromRecipe,
} from './studio-generate-recipe';
import {
  buildStudioPromptData,
  getDefaultStudioGenerateSettings,
} from './studio-generate-settings';

function buildJob(
  overrides: Partial<StudioGenerateJob> = {},
): StudioGenerateJob {
  return {
    createdAt: 1,
    id: 'job-1',
    prompt: 'a prompt',
    status: IngredientStatus.GENERATED,
    type: 'image',
    ...overrides,
  };
}

describe('resolveAspectRatioFromDimensions', () => {
  it('maps a 4:5 pixel pair back onto the aspect ladder', () => {
    expect(resolveAspectRatioFromDimensions(816, 1024)).toBe('4:5');
  });

  it('returns undefined for unusable sizes', () => {
    expect(resolveAspectRatioFromDimensions(0, 1024)).toBeUndefined();
  });
});

describe('recipeFromPromptData', () => {
  it('captures the enriched schema, not just the raw composer text', () => {
    const settings = {
      ...getDefaultStudioGenerateSettings('image'),
      aspectRatio: '4:5',
      camera: 'macro',
      lighting: 'golden hour',
      modelKey: 'flux-dev',
      mood: 'confident',
      outputs: 4,
      promptTemplate: 'product-photo',
      scene: 'rooftop',
      style: 'cinematic',
    };
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'A founder at a desk',
      references: ['https://cdn.example/ref.png'],
      settings,
      type: 'image',
    });
    const recipe = recipeFromPromptData(promptData, 'image', settings);

    expect(recipe).toMatchObject({
      aspectRatio: '4:5',
      brandingMode: 'brand',
      camera: 'macro',
      lighting: 'golden hour',
      modelKey: 'flux-dev',
      mood: 'confident',
      outputs: 4,
      promptTemplate: 'product-photo',
      references: ['https://cdn.example/ref.png'],
      scene: 'rooftop',
      style: 'cinematic',
      text: 'A founder at a desk',
      type: 'image',
    });
  });
});

describe('formatStudioRecipePrompt', () => {
  it('shows the provider-bound recipe instead of the raw box contents', () => {
    const raw = 'A founder at a desk';
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: raw,
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        mood: 'confident',
        promptTemplate: 'product-photo',
        style: 'editorial',
      },
      type: 'image',
    });
    const recipe = recipeFromPromptData(
      promptData,
      'image',
      getDefaultStudioGenerateSettings('image'),
    );
    recipe.mood = 'confident';
    recipe.promptTemplate = 'product-photo';
    recipe.style = 'editorial';
    const formatted = formatStudioRecipePrompt(recipe);

    expect(formatted).toContain(raw);
    expect(formatted).toContain('Brand enrichment: on');
    expect(formatted).toContain('Template: product-photo');
    expect(formatted).toContain('Style: editorial');
    expect(formatted).toContain('Mood: confident');
    expect(formatted).not.toBe(raw);
  });
});

describe('recipeFromRepromptData', () => {
  it('carries look fields forward from buildRepromptData', () => {
    const ingredient = {
      height: 1024,
      metadata: {
        camera: '85mm',
        mood: 'moody',
        style: 'noir',
      },
      metadataHeight: 1024,
      metadataModel: 'flux-dev',
      metadataWidth: 816,
      promptText: 'Original prompt',
      width: 816,
    } as unknown as IIngredient;

    const data = buildRepromptData(
      ingredient,
      IngredientCategory.IMAGE,
      'brand-1',
      [],
    );
    const recipe = recipeFromRepromptData(data, 'image');

    expect(recipe.text).toBe('Original prompt');
    expect(recipe.camera).toBe('85mm');
    expect(recipe.mood).toBe('moody');
    expect(recipe.style).toBe('noir');
    expect(recipe.aspectRatio).toBe('4:5');
    expect(recipe.modelKey).toBe('flux-dev');
    expect(recipe.outputs).toBe(1);
  });
});

describe('settingsPatchFromRecipe', () => {
  it('restores composer settings so Vary can tweak rather than retype', () => {
    const patch = settingsPatchFromRecipe({
      aspectRatio: '9:16',
      blacklist: ['watermark'],
      brandingMode: 'brand',
      camera: 'macro',
      isAudioEnabled: false,
      lighting: 'golden hour',
      modelKey: 'flux-dev',
      mood: 'confident',
      outputs: 4,
      promptTemplate: 'product-photo',
      references: [],
      resolution: '2K',
      style: 'cinematic',
      tags: ['launch'],
      text: 'A founder at a desk',
      type: 'image',
    });

    expect(patch).toMatchObject({
      aspectRatio: '9:16',
      brandingMode: 'brand',
      camera: 'macro',
      lighting: 'golden hour',
      modelKey: 'flux-dev',
      mood: 'confident',
      outputs: 4,
      promptTemplate: 'product-photo',
      resolution: '2K',
      style: 'cinematic',
    });
  });
});

describe('groupStudioGenerateJobsByRun', () => {
  it('groups N outputs from one submit under a single run', () => {
    const jobs = [
      buildJob({ createdAt: 40, id: 'a', runId: 'run-1' }),
      buildJob({ createdAt: 39, id: 'b', runId: 'run-1' }),
      buildJob({ createdAt: 38, id: 'c', runId: 'run-1' }),
      buildJob({ createdAt: 37, id: 'd', runId: 'run-1' }),
      buildJob({ createdAt: 10, id: 'solo' }),
    ];

    const runs = groupStudioGenerateJobsByRun(jobs);

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ id: 'run-1' });
    expect(runs[0]?.jobs.map((job) => job.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(runs[1]?.id).toBe('solo');
    expect(runs[1]?.jobs).toHaveLength(1);
  });
});

describe('resolveRecipeForJob', () => {
  it('prefers the submit-time recipe over reconstructing from the card prompt', () => {
    const recipe = recipeFromPromptData(
      buildStudioPromptData({
        brandId: 'brand-1',
        promptText: 'Enriched',
        settings: {
          ...getDefaultStudioGenerateSettings('image'),
          style: 'editorial',
        },
        type: 'image',
      }),
      'image',
      {
        ...getDefaultStudioGenerateSettings('image'),
        style: 'editorial',
      },
    );
    const resolved = resolveRecipeForJob(
      buildJob({ prompt: 'Raw box', recipe }),
    );

    expect(resolved?.text).toBe('Enriched');
    expect(resolved?.style).toBe('editorial');
  });
});
